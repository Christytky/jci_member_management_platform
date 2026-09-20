"""Excel -> SQLite loader. PRD 4.1.

Reads data/JCI_Victoria_Member_Data.xlsx, creates the schema exactly as
specified in PRD section 4.1, loads all seven tables, and replaces mobiles
and personal emails with deterministic synthetic values.

Names in the source workbook are already synthetic (see PROJECT_OVERVIEW
section 7), so they are preserved -- stable names keep the demo identical
every run. Contact details are regenerated regardless, because those are
what PRD 11 forbids deploying to a public URL.

It also issues one account per member. The account carries no permissions:
it carries a member_id, and the tier is derived from that member's role
record by src.roles every time it is read. The demo_personas table this
replaces did the opposite -- it typed four access levels in by hand and
pinned each to a member, which is exactly the coupling of role and
permission the app no longer has.

Run:  python scripts/load_data.py
"""

from __future__ import annotations

import os
import random
import sqlite3
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src import auth, derived  # noqa: E402

# The workbook to load. Overridable so the President + MA upload page can
# point the loader at a file a user just submitted, without that page having
# to know anything about the schema below.
XLSX = Path(os.environ.get("JCI_SOURCE_XLSX") or ROOT / "data" / "JCI_Victoria_Member_Data.xlsx")
DB = Path(os.environ.get("JCI_DB") or ROOT / "data" / "members.db")

PII_SEED = 20260919  # fixed so every run produces the same demo

SCHEMA = """
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS status_events;
DROP TABLE IF EXISTS fee_records;
DROP TABLE IF EXISTS oc_participation;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS demo_personas;
DROP TABLE IF EXISTS accounts;

CREATE TABLE members (
  member_id TEXT PRIMARY KEY,
  first_name TEXT, last_name TEXT, gender TEXT,
  date_of_birth DATE,
  mobile TEXT, personal_email TEXT, jci_email TEXT,
  member_class TEXT,
  member_status TEXT,
  date_joined DATE, induction_date DATE,
  referred_by TEXT REFERENCES members(member_id),
  company TEXT, job_title TEXT, industry TEXT,
  areas_of_interest TEXT,
  senior_designation TEXT,
  board_post_2026 TEXT, is_bod_2026 TEXT, national_post_2026 TEXT,
  mfg_attended_2026 INTEGER,
  bod_motion_date DATE, bod_motion_result TEXT,
  status_reason TEXT, remark TEXT
);

CREATE TABLE status_events (
  event_id TEXT PRIMARY KEY,
  member_id TEXT REFERENCES members(member_id),
  event_date DATE, event_type TEXT,
  from_status TEXT, to_status TEXT, from_class TEXT, to_class TEXT,
  whatsapp_change TEXT, reason TEXT, recorded_by TEXT
);

CREATE TABLE fee_records (
  member_id TEXT REFERENCES members(member_id),
  fee_year INTEGER, class_that_year TEXT,
  status TEXT,
  submission_date DATE, remark TEXT,
  PRIMARY KEY (member_id, fee_year)
);

CREATE TABLE oc_participation (
  member_id TEXT REFERENCES members(member_id),
  year INTEGER, project_name TEXT, project_type TEXT,
  project_role TEXT,
  date_joined_project DATE,
  counts_toward_fm TEXT
);

CREATE TABLE projects (
  project_name TEXT PRIMARY KEY, project_type TEXT,
  chairman_id TEXT, so_id TEXT, oc_count INTEGER, team_size INTEGER
);

CREATE TABLE activity_log (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TIMESTAMP, actor_name TEXT, actor_role TEXT,
  action TEXT,
  target_member_id TEXT, field_group TEXT, detail TEXT
);

CREATE TABLE accounts (
  username TEXT PRIMARY KEY,
  member_id TEXT REFERENCES members(member_id),
  display_name TEXT,
  password_salt TEXT, password_hash TEXT,
  is_enabled TEXT,
  -- Denormalised for the sign-in screen and the log. The permission check
  -- always re-derives from the member's role record, never from these.
  roles TEXT, role_record TEXT,
  permission_tier TEXT, governing_role TEXT
);

CREATE INDEX idx_events_member ON status_events(member_id);
CREATE INDEX idx_fees_member ON fee_records(member_id);
CREATE INDEX idx_oc_member ON oc_participation(member_id);
"""

MEMBER_MAP = {
    "Member ID": "member_id",
    "First Name": "first_name",
    "Last Name": "last_name",
    "Gender": "gender",
    "Date of Birth": "date_of_birth",
    "Mobile": "mobile",
    "Personal Email": "personal_email",
    "JCI Victoria Email": "jci_email",
    "Member Class": "member_class",
    "Member Status": "member_status",
    "Date Joined": "date_joined",
    "Induction Date": "induction_date",
    "Referred By": "referred_by",
    "Company": "company",
    "Job Title": "job_title",
    "Industry": "industry",
    "Areas of Interest": "areas_of_interest",
    "Senior Designation": "senior_designation",
    "2026 Board Post": "board_post_2026",
    "Board of Directors 2026": "is_bod_2026",
    "2026 National Post": "national_post_2026",
    "MFG Attended (2026)": "mfg_attended_2026",
    "BOD Motion Date": "bod_motion_date",
    "BOD Motion Result": "bod_motion_result",
    "Status Reason": "status_reason",
    "Remark": "remark",
}

EVENT_MAP = {
    "Event ID": "event_id",
    "Member ID": "member_id",
    "Event Date": "event_date",
    "Event Type": "event_type",
    "From Status": "from_status",
    "To Status": "to_status",
    "From Class": "from_class",
    "To Class": "to_class",
    "WhatsApp Group Change": "whatsapp_change",
    "Reason": "reason",
    "Recorded By": "recorded_by",
}

FEE_MAP = {
    "Member ID": "member_id",
    "Fee Year": "fee_year",
    "Member Class That Year": "class_that_year",
    "Status": "status",
    "Submission Date": "submission_date",
    "Remark": "remark",
}

OC_MAP = {
    "Member ID": "member_id",
    "Year": "year",
    "Project / MFG": "project_name",
    "Type": "project_type",
    "Project Role": "project_role",
    "Date Joined Project": "date_joined_project",
    "Counts Toward FM Requirement": "counts_toward_fm",
}


def _dates(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_datetime(df[c], errors="coerce").dt.strftime("%Y-%m-%d")
    return df


def scrub_pii(members: pd.DataFrame) -> pd.DataFrame:
    """Replace mobiles and personal emails with deterministic fakes.

    PRD 11: no real member's mobile or personal email may reach the public
    URL. Seeded so the demo is byte-identical on every rebuild.
    """
    rng = random.Random(PII_SEED)
    providers = ["gmail.com", "outlook.com", "yahoo.com.hk", "icloud.com"]

    mobiles, emails = [], []
    for _, row in members.iterrows():
        mobiles.append(f"+852{rng.randint(5100, 6999)}{rng.randint(1000, 9999)}")
        first = str(row["first_name"]).lower().replace(" ", "")
        last = str(row["last_name"]).lower().replace(" ", "")
        emails.append(f"{first}.{last}{rng.randint(1, 99)}@{rng.choice(providers)}")

    members["mobile"] = mobiles
    members["personal_email"] = emails
    return members


def main() -> None:
    xl = pd.ExcelFile(XLSX)

    members = xl.parse("01 Members")[list(MEMBER_MAP)].rename(columns=MEMBER_MAP)
    members = _dates(members, ["date_of_birth", "date_joined", "induction_date", "bod_motion_date"])
    members["mfg_attended_2026"] = (
        pd.to_numeric(members["mfg_attended_2026"], errors="coerce").fillna(0).astype(int)
    )
    members = scrub_pii(members)

    events = xl.parse("02 Status History")[list(EVENT_MAP)].rename(columns=EVENT_MAP)
    events = _dates(events, ["event_date"])

    fees = xl.parse("03 Fee History")[list(FEE_MAP)].rename(columns=FEE_MAP)
    fees = _dates(fees, ["submission_date"])
    fees["fee_year"] = fees["fee_year"].astype(int)

    oc = xl.parse("04 OC Team Participation")[list(OC_MAP)].rename(columns=OC_MAP)
    oc = _dates(oc, ["date_joined_project"])
    oc["year"] = oc["year"].astype(int)

    roster = xl.parse("05 Project Roster 2026")
    name_to_id = {
        f"{r.first_name} {r.last_name}".strip(): r.member_id for r in members.itertuples()
    }
    projects = pd.DataFrame(
        {
            "project_name": roster["Project / MFG"],
            "project_type": roster["Type"],
            "chairman_id": roster["Chairman"].map(lambda n: name_to_id.get(str(n).strip())),
            "so_id": roster["Supervising Officer (SO)"].map(
                lambda n: name_to_id.get(str(n).strip())
            ),
            "oc_count": pd.to_numeric(roster["OC Members"], errors="coerce").fillna(0).astype(int),
            "team_size": pd.to_numeric(roster["Total Team Size"], errors="coerce")
            .fillna(0)
            .astype(int),
        }
    )

    DB.unlink(missing_ok=True)
    # Accounts need the derived role record, so they are built from the
    # enriched frame rather than the raw sheet -- one code path with the
    # exporter, which reads the same function.
    accounts = auth.build_accounts(
        derived.enrich(
            {
                "members": members,
                "events": events,
                "fees": fees,
                "oc": oc,
            }
        )
    )

    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    for name, df in [
        ("members", members),
        ("status_events", events),
        ("fee_records", fees),
        ("oc_participation", oc),
        ("projects", projects),
        ("accounts", accounts),
    ]:
        df.to_sql(name, con, if_exists="append", index=False)
        print(f"  {name:18} {len(df):>4} rows")
    con.commit()
    con.close()
    print(f"\nWrote {DB}")
    enabled = int((accounts["is_enabled"] == "Y").sum())
    print(f"\nAccounts: {len(accounts)} issued, {enabled} enabled.")
    print("Permission tier per account, derived from the role record:")
    print(
        accounts[accounts["is_enabled"] == "Y"]["permission_tier"]
        .value_counts()
        .to_string()
    )


if __name__ == "__main__":
    main()
