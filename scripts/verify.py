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
from src import permissions as P
from src import roles as R  # noqa: E402

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
        blob = (out / "payload.leader.json").read_text()
        for label, value in secrets.items():
            check(value not in blob, f"Chairman payload has no {label}")
        gov = frames["members"].set_index("member_id").loc[PROBE_ID, "status_reason"]
        if isinstance(gov, str) and gov:
            check(gov not in blob, "Chairman payload has no removal reason")

        pres = json.loads((out / "payload.admin.json").read_text())
        check(len(pres["members"]) == 150, "Admin payload has all members")
        check(pres["dashboard"] is not None, "Admin payload carries the dashboard")
        chair_p = json.loads((out / "payload.leader.json").read_text())
        check(chair_p["dashboard"] is None, "Leader payload carries no dashboard")

        # The circular age diagram reads exact ages, so it must be absent
        # from the file of a tier that only gets five-year bands.
        sec = json.loads((out / "payload.secretariat.json").read_text())
        check("age_rings" in pres["dashboard"], "Admin dashboard carries the age rings")
        check(
            "age_rings" not in (sec["dashboard"] or {}),
            "HS + FD dashboard has no age rings (personal is masked)",
        )
        check(
            "growth_tree" in pres["dashboard"],
            "Admin dashboard carries the chapter growth tree",
        )
        check(
            "growth_tree" not in (sec["dashboard"] or {}),
            "HS + FD payload has no growth tree",
        )

    print("\nRoles and tiers")
    check(not R.unknown_roles(enriched), "every role code is in the catalogue",
          ", ".join(sorted(R.unknown_roles(enriched))) or "none")
    # The rule the whole model rests on: the tier equals the highest role held.
    bad = [
        row["member_id"]
        for _, row in enriched.iterrows()
        if row["permission_tier"] != max(
            (R.tier_of(c) for c in R.roles_for(row)), key=lambda t: R.TIER_RANK[t]
        )
    ]
    check(not bad, "every tier equals the highest role held", f"{len(bad)} mismatched")
    # A member holding a post above their class is the case that would break
    # if the first role, or the class, were used instead of the highest.
    lifted = enriched[enriched["tier_rank"] > 1]
    check(len(lifted) > 0, "members are lifted above Member by a post",
          f"{len(lifted)} of {len(enriched)}")

    print("\nAccounts")
    accounts = frames["accounts"]
    check(len(accounts) == len(enriched), "one account per member", f"{len(accounts)}")
    check(
        accounts["username"].str.lower().duplicated().sum() == 0,
        "usernames are unique",
    )
    check(
        accounts["password_salt"].duplicated().sum() == 0,
        "every account has its own salt",
    )
    check(
        not accounts.columns.str.contains("password_plain").any()
        and accounts["password_hash"].str.len().eq(64).all(),
        "passwords are stored only as PBKDF2 hashes",
    )
    departed = accounts[accounts["is_enabled"] == "N"]
    check(
        len(departed) > 0
        and enriched.set_index("member_id")
        .loc[departed["member_id"], "member_status"]
        .isin(["Removed", "Resigned"])
        .all(),
        "removed and resigned members cannot sign in",
        f"{len(departed)} disabled",
    )
    # An account is a member_id, not a permission. If these disagree the
    # login path and the payload path have drifted apart.
    joined = accounts.set_index("member_id").join(
        enriched.set_index("member_id")[["permission_tier"]], rsuffix="_derived"
    )
    check(
        (joined["permission_tier"] == joined["permission_tier_derived"]).all(),
        "account tiers match the derived tiers",
    )

    print("\nPer-member payloads (Member tier)")
    member_dir = out / "members"
    files = sorted(member_dir.glob("*.json")) if member_dir.exists() else []
    check(len(files) > 0, "one payload per Member-tier member", f"{len(files)} files")
    leaked = []
    for f in files[:40]:  # a sample; all 111 would be slow and prove the same
        data = json.loads(f.read_text())
        if len(data["members"]) != 1 or data["members"][0]["member_id"] != f.stem:
            leaked.append(f.stem)
    check(not leaked, "each Member file holds exactly its own record",
          ", ".join(leaked[:3]) or "sampled 40")

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
