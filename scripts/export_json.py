"""Build the per-persona payloads the web app reads.

One JSON file per demo persona, each already filtered through
permissions.apply(). The Next.js app reads these in server components, so a
field hidden from a role is absent from the file, absent from the server
render and absent from the browser. That is what makes PRD 11's "hidden
fields are absent from the data passed to the page" literally true rather
than a claim about CSS.

Run:  python scripts/export_json.py
Out:  web/data/payload.<persona_key>.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src import alerts, db, derived, health  # noqa: E402
from src import permissions as P  # noqa: E402

OUT = ROOT / "web" / "data"

DEPARTED = ("Removed", "Resigned")


def clean(obj):
    """NaN/NaT -> null, numpy scalars -> python, so json.dump succeeds."""
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return None if np.isnan(obj) else float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if obj is pd.NaT or (isinstance(obj, float) and pd.isna(obj)):
        return None
    if obj is pd.NA:
        return None
    return obj


def records(df: pd.DataFrame) -> list[dict]:
    return clean(df.replace({np.nan: None}).to_dict(orient="records"))


def movement_by_year(events: pd.DataFrame) -> list[dict]:
    """The chart PRD 6.2 gives the most screen space to."""
    e = events.copy()
    e["year"] = pd.to_datetime(e["event_date"]).dt.year
    e = e[e["year"] <= derived.AS_OF.year]
    series = {
        "joined": e["event_type"] == "Joined as PM",
        "inducted": e["event_type"] == "Inducted",
        "senior": e["event_type"] == "Transferred to Senior Member",
        "departed": e["event_type"].isin(
            ["BOD Motion Approved - Removed", "BOD Motion Approved - Resigned"]
        ),
    }
    years = sorted(e["year"].dropna().unique())
    out = []
    for y in years:
        row = {"year": int(y)}
        for name, mask in series.items():
            row[name] = int(((e["year"] == y) & mask).sum())
        if any(row[k] for k in series):
            out.append(row)
    return out


def pm_funnel(m: pd.DataFrame) -> list[dict]:
    pm = m[m["member_class"] == "PM"]
    return [
        {"stage": "Not Started", "count": int((pm["fm_status"] == "Not Started").sum())},
        {"stage": "In Progress", "count": int((pm["fm_status"] == "In Progress (1/2)").sum())},
        {"stage": "Completed", "count": int((pm["fm_status"] == "Completed").sum())},
        {"stage": "Pending Induction", "count": int((pm["member_status"] == "Pending Induction").sum())},
        {"stage": "Inducted", "count": int((m["member_class"].isin(["FM", "SM"])).sum())},
    ]


def departure_reasons(m: pd.DataFrame) -> list[dict]:
    d = m[m["member_status"].isin(DEPARTED)]
    vc = d["status_reason"].fillna("Not recorded").value_counts()
    return [{"reason": k, "count": int(v)} for k, v in vc.items()]


def kpis(m: pd.DataFrame, al: pd.DataFrame) -> dict:
    active = m[m["member_status"] == "Active"]
    return {
        "active_members": int(len(active)),
        "active_pms": int(((m["member_class"] == "PM") & (m["member_status"] == "Active")).sum()),
        "pms_overdue": int((al["rule_no"] == 2).sum()),
        "unpaid_fees": int((al["rule_no"] == 4).sum()),
        "at_risk": int((m["health_band"] == "At risk").sum()),
        "total_members": int(len(m)),
        "full_members": int((m["member_class"] == "FM").sum()),
        "senior_members": int((m["member_class"] == "SM").sum()),
        "open_alerts": int(len(al)),
    }


def needs_attention(m: pd.DataFrame, limit: int = 5) -> list[dict]:
    """PRD 6.2 right column: the five worst, each with a plain-language why."""
    risk = m[m["health_band"] == "At risk"].sort_values("health_score")
    out = []
    for _, row in risk.head(limit).iterrows():
        out.append(
            {
                "member_id": row["member_id"],
                "name": row["full_name"],
                "score": int(row["health_score"]),
                "reasons": health.reasons(row)[:2],
            }
        )
    return out


def main() -> None:
    frames = db.get_frames()
    enriched = health.score(derived.enrich(frames))
    all_alerts = alerts.build(enriched, frames)
    personas = frames["personas"]

    OUT.mkdir(parents=True, exist_ok=True)
    index = []

    for _, p in personas.iterrows():
        role, key = p["role"], p["persona_key"]
        own = p["member_id"] if role == "Member" else None
        visible = P.apply(enriched, role, own)
        ids = set(visible["member_id"])

        # Alerts are scoped by the field group they come from: a role that
        # cannot see finance cannot see fee alerts.
        al = all_alerts[all_alerts["member_id"].isin(ids)].copy()
        if role == "HS + FD":
            al = al[al["rule_no"].isin([3, 4, 5, 7])]  # finance + secretariat only
        elif role in ("Board / Chairman / SO", "Member"):
            al = al.iloc[0:0]

        # Field-group permissions must follow the data into every table, not
        # just members. status_events.reason carries the same sentence as
        # members.status_reason ("Non-payment of 2026 subscription"), so a
        # role with governance hidden would have read the removal reason off
        # the journey timeline while the governance card was correctly absent.
        # Strip it at the source.
        events = frames["events"][frames["events"]["member_id"].isin(ids)].copy()
        if not P.can_see(role, "governance"):
            events = events.drop(columns=["reason", "recorded_by"], errors="ignore")

        can_dash = P.can_open(role, "dashboard")
        payload = {
            "persona": {
                "key": key,
                "name": p["display_name"],
                "role": role,
                "member_id": p["member_id"],
                "post": _post_for(enriched, p["member_id"]),
            },
            "as_of": derived.AS_OF.isoformat(),
            "access": {
                "visible_groups": P.visible_groups(role),
                "hidden_groups": P.hidden_groups(role),
                "banner": P.describe(role),
                "pages": {pg: P.can_open(role, pg) for pg in P.PAGE_ACCESS},
                "column_count": len(visible.columns),
            },
            "members": records(visible),
            "alerts": records(al),
            "events": records(events),
            "fees": records(
                frames["fees"][frames["fees"]["member_id"].isin(ids)]
            ) if P.can_see(role, "finance") else [],
            "oc": records(frames["oc"][frames["oc"]["member_id"].isin(ids)]),
            "projects": records(frames["projects"]),
            "dashboard": {
                "kpis": kpis(enriched, all_alerts),
                "movement": movement_by_year(frames["events"]),
                "funnel": pm_funnel(enriched),
                "departures": departure_reasons(enriched),
                "needs_attention": needs_attention(enriched),
            } if can_dash else None,
        }

        path = OUT / f"payload.{key}.json"
        path.write_text(json.dumps(payload, indent=None, separators=(",", ":")))
        index.append(
            {
                "key": key,
                "name": p["display_name"],
                "role": role,
                "member_id": p["member_id"],
                "post": payload["persona"]["post"],
                "columns": len(visible.columns),
                "members": len(visible),
                "alerts": len(al),
                "hidden": P.hidden_groups(role),
            }
        )
        size = path.stat().st_size / 1024
        print(
            f"  {key:10} {role:24} {len(visible):>3} members  "
            f"{len(visible.columns):>2} cols  {len(al):>2} alerts  {size:>6.1f} KB"
        )

    (OUT / "personas.json").write_text(json.dumps(clean(index), indent=2))
    print(f"\nWrote {len(index)} payloads to {OUT}")


def _post_for(m: pd.DataFrame, member_id: str) -> str:
    row = m[m["member_id"] == member_id]
    if row.empty:
        return ""
    post = row.iloc[0]["board_post_2026"]
    role = row.iloc[0]["project_role_2026"]
    if pd.notna(post) and post:
        return str(post)
    return "Chairman" if role == "Chairman" else "Member"


if __name__ == "__main__":
    main()
