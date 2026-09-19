"""Acceptance check. PRD 11.

Run this before every deploy and at the hour-8 checkpoint. It is the
difference between "the alerts page looks right" and "the alerts page is
right".

Run:  python scripts/verify.py
Exit: 0 if every check passes, 1 otherwise.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src import alerts, db, derived, health  # noqa: E402
from src import permissions as P  # noqa: E402

EXPECTED_ALERTS = {1: 4, 2: 10, 3: 6, 4: 23, 5: 5, 6: 7, 7: 8}
EXPECTED_ROWS = {
    "members": 150,
    "events": 443,
    "fees": 409,
    "oc": 136,
    "projects": 17,
}

# Real values for one member, used to prove the payloads withhold what they
# should. If the seed changes, refresh these from the loader output.
PROBE_ID = "VJC-0089"

failures: list[str] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{f' — {detail}' if detail else ''}")
    if not ok:
        failures.append(label)


def main() -> None:
    frames = db.get_frames()
    enriched = health.score(derived.enrich(frames))
    al = alerts.build(enriched, frames)

    print("\nRow counts")
    for key, want in EXPECTED_ROWS.items():
        got = len(frames[key])
        check(got == want, f"{key} loaded", f"{got} rows (expected {want})")

    print("\nDerived fields vs the source spreadsheet")
    raw = pd.ExcelFile(ROOT / "data" / "JCI_Victoria_Member_Data.xlsx").parse("01 Members")
    mismatches = derived.verify(enriched, raw)
    check(
        mismatches <= 3,
        "derived fields match",
        f"{mismatches} differences (3 expected: Chairman/SO rank, PRD 4.2)",
    )

    print("\nAlert rules (PRD 6.3)")
    counts = alerts.counts(al)
    for no, want in EXPECTED_ALERTS.items():
        got = counts.get(no, 0)
        check(got == want, f"rule {no} fires", f"{got} (expected {want})")
    check(all(counts.get(n, 0) > 0 for n in EXPECTED_ALERTS), "no rule is empty")

    print("\nHealth score (PRD 4.3)")
    scored = enriched[enriched["member_class"].isin(["PM", "FM"])]
    unscored = enriched[enriched["member_class"] == "SM"]
    check(scored["health_score"].notna().all(), "every PM and FM is scored")
    check(unscored["health_score"].isna().all(), "Senior Members show N/A")
    check(
        scored["health_score"].between(0, 100).all(),
        "scores are within 0-100",
        f"{scored['health_score'].min()}-{scored['health_score'].max()}",
    )

    print("\nPermissions (PRD 3.1)")
    widths = {}
    for role in P.ROLES:
        own = enriched.iloc[0]["member_id"] if role == "Member" else None
        v = P.apply(enriched, role, own)
        widths[role] = len(v.columns)
    check(
        widths["President + MA"] > widths["HS + FD"] > widths["Board / Chairman / SO"],
        "access narrows with role",
        " > ".join(f"{r.split(' ')[0]}:{w}" for r, w in widths.items()),
    )
    chair = P.apply(enriched, "Board / Chairman / SO")
    for col in ("date_of_birth", "fee_status_current", "status_reason", "health_score"):
        check(col not in chair.columns, f"Chairman payload drops {col}")
    member_view = P.apply(enriched, "Member", PROBE_ID)
    check(len(member_view) == 1, "Member sees exactly one record", f"{len(member_view)} rows")

    print("\nExported payloads")
    out = ROOT / "web" / "data"
    if not out.exists():
        check(False, "payloads exported", "run scripts/export_json.py first")
    else:
        real = frames["members"].set_index("member_id").loc[PROBE_ID]
        secrets = {
            "date of birth": str(real["date_of_birth"]),
            "mobile": str(real["mobile"]),
            "personal email": str(real["personal_email"]),
        }
        blob = (out / "payload.chairman.json").read_text()
        for label, value in secrets.items():
            check(value not in blob, f"Chairman payload has no {label}")
        gov = frames["members"].set_index("member_id").loc[PROBE_ID, "status_reason"]
        if isinstance(gov, str) and gov:
            check(gov not in blob, "Chairman payload has no removal reason")

        pres = json.loads((out / "payload.president.json").read_text())
        check(len(pres["members"]) == 150, "President payload has all members")
        check(pres["dashboard"] is not None, "President payload carries the dashboard")
        chair_p = json.loads((out / "payload.chairman.json").read_text())
        check(chair_p["dashboard"] is None, "Chairman payload carries no dashboard")

    print("\nPII (PRD 11)")
    mob = frames["members"]["mobile"].astype(str)
    check(mob.str.match(r"^\+852\d{8}$").all(), "all mobiles are synthetic format")
    check(
        frames["members"]["personal_email"].astype(str).str.contains("@").all(),
        "all personal emails regenerated",
    )

    print()
    if failures:
        print(f"{len(failures)} CHECK(S) FAILED:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("All acceptance checks passed.")


if __name__ == "__main__":
    main()
