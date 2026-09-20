"""Check a submitted workbook before it is allowed to replace the database.

Written for the President + MA upload page, which stages a file and shows
this report before anything is written. The report is the whole point: an
import that silently drops a sheet, or loads 40 rows where 150 were meant,
is worse than an import that refuses.

Prints one JSON object on stdout. Exit code is 0 for a readable file and 1
for one that could not be opened at all -- a workbook with problems still
exits 0, because "here is what is wrong with it" is a successful check.

Run:  python scripts/validate_upload.py <path to .xlsx>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts import load_data as L  # noqa: E402

# Sheet -> (column map it will be read with, whether the load fails without it)
EXPECTED = [
    ("01 Members", L.MEMBER_MAP, True),
    ("02 Status History", L.EVENT_MAP, True),
    ("03 Fee History", L.FEE_MAP, True),
    ("04 OC Team Participation", L.OC_MAP, True),
    ("05 Project Roster 2026", None, True),
]

# Values the loader's own rules depend on. A workbook using different spellings
# loads without error and then quietly reports the wrong FM status for everyone.
ENUMS = {
    "Member Class": {"PM", "FM", "SM"},
    "Member Status": {
        "Active", "Pending Induction", "Pending Fee", "Pending BOD Motion",
        "Removed", "Resigned",
    },
}


def check(path: Path) -> dict:
    try:
        xl = pd.ExcelFile(path)
    except Exception as exc:  # noqa: BLE001 - the message is the report
        return {"ok": False, "fatal": f"Could not open the workbook: {exc}", "sheets": []}

    report: dict = {"ok": True, "fatal": None, "file": path.name, "sheets": [], "problems": []}
    present = set(xl.sheet_names)

    for name, colmap, required in EXPECTED:
        entry = {"sheet": name, "present": name in present, "rows": 0, "missing_columns": []}
        if name not in present:
            entry["required"] = required
            report["sheets"].append(entry)
            if required:
                report["ok"] = False
                report["problems"].append(f"Sheet '{name}' is missing.")
            continue

        df = xl.parse(name)
        entry["rows"] = int(len(df))
        if colmap:
            missing = [c for c in colmap if c not in df.columns]
            entry["missing_columns"] = missing
            if missing:
                report["ok"] = False
                report["problems"].append(
                    f"'{name}' is missing {len(missing)} column(s): {', '.join(missing)}"
                )
        report["sheets"].append(entry)

    # Row-level checks on the members sheet, where a bad value does the most damage.
    if "01 Members" in present:
        m = xl.parse("01 Members")
        if "Member ID" in m.columns:
            ids = m["Member ID"].astype(str).str.strip()
            blank = int((ids == "").sum() + ids.isin(["nan", "None"]).sum())
            dupes = int(ids.duplicated().sum())
            if blank:
                report["ok"] = False
                report["problems"].append(f"{blank} member row(s) have no Member ID.")
            if dupes:
                report["ok"] = False
                report["problems"].append(f"{dupes} duplicate Member ID(s).")
            report["member_count"] = int(len(m))

        for column, allowed in ENUMS.items():
            if column not in m.columns:
                continue
            seen = set(m[column].dropna().astype(str).str.strip()) - allowed
            if seen:
                report["ok"] = False
                report["problems"].append(
                    f"'{column}' contains unrecognised value(s): {', '.join(sorted(seen))}"
                )

        # Unknown role codes load fine and fail safe to the Member tier -- which
        # is exactly why they have to be named here rather than discovered when
        # a director cannot open a page they should have.
        from src import roles as R  # noqa: PLC0415 - optional import path

        unknown: set[str] = set()
        for column in ("2026 Board Post", "2026 National Post", "Senior Designation"):
            if column not in m.columns:
                continue
            for value in m[column].dropna().astype(str):
                for code in value.replace("/", ",").split(","):
                    code = code.strip()
                    if code and code not in R.CATALOGUE:
                        unknown.add(code)
        if unknown:
            report["problems"].append(
                "Role code(s) not in the catalogue, which will fall back to the Member "
                f"tier: {', '.join(sorted(unknown))}. Add them to src/roles.py."
            )
            report["unknown_roles"] = sorted(unknown)

    return report


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "fatal": "No file given", "sheets": []}))
        raise SystemExit(1)
    path = Path(sys.argv[1])
    if not path.exists():
        print(json.dumps({"ok": False, "fatal": f"{path.name} not found", "sheets": []}))
        raise SystemExit(1)
    report = check(path)
    print(json.dumps(report))
    raise SystemExit(0 if report.get("fatal") is None else 1)


if __name__ == "__main__":
    main()
