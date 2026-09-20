"""Build the payloads and account index the web app reads.

Two things changed here when logins became individual.

1. Payloads are keyed by PERMISSION TIER, not by persona. There were five
   demo personas and two of them (President, MA) held identical access, so
   two identical files were written and a "role" was really a tier wearing a
   name. Now there are three tier files plus one small file per member on the
   Member tier -- because a Member sees exactly their own record, and the
   only honest way to keep that true is to never put anyone else's row in
   the file they are served.

2. accounts.json carries every member's login and the tier their ROLE RECORD
   earns them. It holds a PBKDF2 salt and hash, never a password, and it is
   read only by the server (web/lib/auth.ts is "server-only").

The guarantee is unchanged and now covers more files: a field a tier may not
see is absent from every file that tier can be served.

Run:  python scripts/export_json.py
Out:  web/data/payload.<tier>.json, web/data/members/<member_id>.json,
      web/data/accounts.json, web/data/tiers.json, web/data/roles.json,
      web/data/growth-meta.json, web/data/demo-accounts.json
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src import alerts, auth, db, derived, growth, health  # noqa: E402
from src import permissions as P  # noqa: E402
from src import roles as R  # noqa: E402

OUT = ROOT / "web" / "data"
MEMBER_DIR = OUT / "members"

DEPARTED = ("Removed", "Resigned")

# Directory slug per tier. Short, stable, and never shown to a user -- the
# tier string itself stays the vocabulary everywhere else.
TIER_SLUG = {
    R.ADMIN: "admin",
    R.SECRETARIAT: "secretariat",
    R.LEADER: "leader",
    R.MEMBER: "member",
}


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


def scoped_events(frames, role: str, ids: set[str]) -> pd.DataFrame:
    """Field-group permissions must follow the data into every table.

    status_events.reason carries the same sentence as members.status_reason
    ("Non-payment of 2026 subscription"), so a role with governance hidden
    would have read the removal reason off the journey timeline while the
    governance card was correctly absent. Strip it at the source.
    """
    events = frames["events"][frames["events"]["member_id"].isin(ids)].copy()
    if not P.can_see(role, "governance"):
        events = events.drop(columns=["reason", "recorded_by"], errors="ignore")
    return events


def access_block(role: str, visible: pd.DataFrame, total_fields: int) -> dict:
    return {
        "tier": role,
        "tier_rank": R.TIER_RANK[role],
        "visible_groups": P.visible_groups(role),
        "hidden_groups": P.hidden_groups(role),
        "masked_groups": P.masked_groups(role),
        "banner": P.describe(role),
        "pages": {pg: P.can_open(role, pg) for pg in P.PAGE_ACCESS},
        "can_write": P.can_write(role),
        "column_count": len(visible.columns),
        # Shipped rather than hardcoded in the banner: adding a derived column
        # used to leave "n of 53" quietly wrong.
        "total_fields": total_fields,
    }


def build_payload(role, visible, al, frames, enriched, all_alerts, ids) -> dict:
    total_fields = len(enriched.columns)
    can_dash = P.can_open(role, "dashboard")
    dashboard = None
    if can_dash:
        dashboard = {
            "kpis": kpis(enriched, all_alerts),
            "movement": movement_by_year(frames["events"]),
            "funnel": pm_funnel(enriched),
            "departures": departure_reasons(enriched),
            "needs_attention": needs_attention(enriched),
        }
        # FM and PM average age against the 40-year ceiling -- the circular
        # diagram on the dashboard. An average is still an age, and HS + FD
        # hold MASKED access to the personal group: they get five-year bands,
        # not exact figures. So the rings ship only to a tier holding FULL
        # personal access, which is President + MA. Absent from the file, not
        # hidden on the page.
        if P.access(role, "personal") == P.FULL:
            dashboard["age_rings"] = growth.age_rings(enriched)
        # The chapter-wide referral tree is an admin view -- it reads every
        # member's lineage at once, so it ships only in the file the tier
        # that may open /growth is served.
        if P.can_open(role, "growth"):
            dashboard["growth_tree"] = growth.growth_tree(enriched)

    return {
        "as_of": derived.AS_OF.isoformat(),
        "access": access_block(role, visible, total_fields),
        "members": records(visible),
        "alerts": records(al),
        "events": records(scoped_events(frames, role, ids)),
        "fees": records(frames["fees"][frames["fees"]["member_id"].isin(ids)])
        if P.can_see(role, "finance")
        else [],
        "oc": records(frames["oc"][frames["oc"]["member_id"].isin(ids)]),
        "projects": records(frames["projects"]),
        "dashboard": dashboard,
    }


def scope_alerts(all_alerts: pd.DataFrame, role: str, ids: set[str]) -> pd.DataFrame:
    """Alerts inherit the field group they came from."""
    al = all_alerts[all_alerts["member_id"].isin(ids)].copy()
    if role == R.SECRETARIAT:
        return al[al["rule_no"].isin([3, 4, 5, 7])]  # finance + secretariat only
    if role in (R.LEADER, R.MEMBER):
        return al.iloc[0:0]
    return al


def main() -> None:
    frames = db.get_frames()
    enriched = health.score(derived.enrich(frames))
    all_alerts = alerts.build(enriched, frames)

    OUT.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(MEMBER_DIR, ignore_errors=True)
    MEMBER_DIR.mkdir(parents=True, exist_ok=True)

    # ---- one file per tier, except Member -------------------------------
    tier_index = []
    for role in R.TIERS:
        if role == R.MEMBER:
            continue
        visible = P.apply(enriched, role)
        ids = set(visible["member_id"])
        al = scope_alerts(all_alerts, role, ids)
        payload = build_payload(role, visible, al, frames, enriched, all_alerts, ids)

        path = OUT / f"payload.{TIER_SLUG[role]}.json"
        path.write_text(json.dumps(payload, separators=(",", ":")))
        size = path.stat().st_size / 1024
        tier_index.append(
            {
                "tier": role,
                "slug": TIER_SLUG[role],
                "rank": R.TIER_RANK[role],
                "columns": len(visible.columns),
                "members": len(visible),
                "alerts": len(al),
                "hidden": P.hidden_groups(role),
                "pages": [pg for pg in P.PAGE_ACCESS if P.can_open(role, pg)],
                "roles": [
                    r.code for r in R.CATALOGUE.values() if r.tier == role
                ],
            }
        )
        print(
            f"  tier {TIER_SLUG[role]:12} {role:24} {len(visible):>3} members  "
            f"{len(visible.columns):>2} cols  {len(al):>2} alerts  {size:>7.1f} KB"
        )

    # ---- one small file per member on the Member tier -------------------
    member_tier = enriched[enriched["permission_tier"] == R.MEMBER]
    written, total_kb = 0, 0.0
    for member_id in member_tier["member_id"]:
        visible = P.apply(enriched, R.MEMBER, member_id)
        ids = {member_id}
        payload = build_payload(
            R.MEMBER, visible, scope_alerts(all_alerts, R.MEMBER, ids),
            frames, enriched, all_alerts, ids,
        )
        path = MEMBER_DIR / f"{member_id}.json"
        path.write_text(json.dumps(payload, separators=(",", ":")))
        written += 1
        total_kb += path.stat().st_size / 1024
    print(
        f"  tier {'member':12} {R.MEMBER:24} {written:>3} files   "
        f"own record only          {total_kb:>7.1f} KB total"
    )

    (OUT / "tiers.json").write_text(json.dumps(clean(tier_index), indent=2))

    # ---- accounts -------------------------------------------------------
    accounts = auth.build_accounts(enriched)
    (OUT / "accounts.json").write_text(
        json.dumps(clean(accounts.to_dict(orient="records")), separators=(",", ":"))
    )
    enabled = int((accounts["is_enabled"] == "Y").sum())
    print(
        f"\n  accounts    {len(accounts):>3} issued, {enabled} enabled  "
        f"({len(accounts) - enabled} removed/resigned cannot sign in)"
    )
    by_tier = accounts[accounts["is_enabled"] == "Y"]["permission_tier"].value_counts()
    for tier in R.TIERS:
        print(f"    {tier:24} {int(by_tier.get(tier, 0)):>3}")

    # ---- reference tables the UI reads ----------------------------------
    (OUT / "roles.json").write_text(
        json.dumps(
            {
                "tiers": [
                    {"tier": t, "rank": R.TIER_RANK[t], "slug": TIER_SLUG[t]}
                    for t in R.TIERS
                ],
                "roles": [r.as_dict() for r in R.CATALOGUE.values()],
            },
            indent=2,
        )
    )
    (OUT / "growth-meta.json").write_text(
        json.dumps(
            {
                "ladder": [
                    {"code": c, "label": l, "rank": rk} for c, l, rk in growth.LADDER
                ],
                "event_kinds": {
                    k: {"kind": v[0], "label": v[1]} for k, v in growth.EVENT_KINDS.items()
                },
                "promotion_kinds": list(growth.PROMOTION_KINDS),
                "senior_age": growth.SENIOR_AGE,
            },
            indent=2,
        )
    )

    # Seeded demo logins for the sign-in screen. Synthetic data only -- the
    # page that renders these checks the same flag before it does.
    if os.environ.get("JCI_DEMO_ACCOUNTS", "1") == "1":
        roster = auth.demo_roster(accounts, limit_per_tier=2)
        (OUT / "demo-accounts.json").write_text(json.dumps(clean(roster), indent=2))
        print(f"\n  demo logins {len(roster)} on the sign-in screen (JCI_DEMO_ACCOUNTS=0 to omit)")
    else:
        (OUT / "demo-accounts.json").write_text("[]")

    # Old persona-keyed files, from before logins were individual.
    for stale in OUT.glob("payload.*.json"):
        if stale.stem.split(".", 1)[1] not in TIER_SLUG.values():
            stale.unlink()
            print(f"  removed stale {stale.name}")
    if (OUT / "personas.json").exists():
        (OUT / "personas.json").unlink()
        print("  removed stale personas.json")

    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
