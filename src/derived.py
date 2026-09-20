"""Derived fields. PRD 4.2.

Principle: stored fields are facts; everything here is computed at read
time and never written back to the database. This is what stops the
record going stale the way a spreadsheet does.
"""

from __future__ import annotations

import os
from datetime import date, datetime

import pandas as pd

from src import roles

# Reference date for every age, deadline and recency calculation.
# Pinned so the demo is identical on every run and on every machine.
AS_OF = datetime.strptime(os.environ.get("JCI_AS_OF", "2026-09-19"), "%Y-%m-%d").date()

FM_WINDOW_DAYS = 183  # six months, PRD 4.2
SENIOR_AGE = 40


def _d(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce")


def _years_between(start: pd.Series, end: date) -> pd.Series:
    s = _d(start)
    ref = pd.Timestamp(end)
    full = ref.year - s.dt.year
    had_birthday = (s.dt.month < ref.month) | (
        (s.dt.month == ref.month) & (s.dt.day <= ref.day)
    )
    return (full - (~had_birthday).astype("Int64")).astype("Int64")


def enrich(frames: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """members + every PRD 4.2 column."""
    m = frames["members"].copy()
    events, fees, oc = frames["events"], frames["fees"], frames["oc"]
    ref = pd.Timestamp(AS_OF)

    # Two age bases, deliberately. PRD 4.2 defines age as years between
    # date of birth and today, which is what we display. The chapter's own
    # sheet uses calendar-year age (year - birth year), which is the basis
    # senior transfer actually runs on -- you transfer in the year you turn
    # 40, not on your birthday. Forecasting uses the calendar basis so the
    # transfer year we show matches what the chapter expects.
    m["age"] = _years_between(m["date_of_birth"], AS_OF)
    m["age_calendar_year"] = (AS_OF.year - _d(m["date_of_birth"]).dt.year).astype("Int64")

    # Year the member turns 40. Blank for members already Senior.
    turns_40 = _d(m["date_of_birth"]).dt.year + SENIOR_AGE
    m["senior_transfer_year"] = turns_40.where(m["member_class"] != "SM").astype("Int64")
    m["years_to_senior"] = (m["senior_transfer_year"] - AS_OF.year).astype("Int64")

    # FM requirement window applies to PMs only.
    deadline = _d(m["date_joined"]) + pd.Timedelta(days=FM_WINDOW_DAYS)
    m["fm_deadline"] = deadline.where(m["member_class"] == "PM").dt.strftime("%Y-%m-%d")

    counted = (
        oc[oc["counts_toward_fm"] == "Y"]
        .groupby("member_id")
        .size()
        .rename("fm_teams_counted")
    )
    m = m.merge(counted, left_on="member_id", right_index=True, how="left")
    m["fm_teams_counted"] = m["fm_teams_counted"].fillna(0).astype(int)

    m["fm_status"] = _fm_status(m, deadline, ref)
    m["days_to_fm_deadline"] = (deadline - ref).dt.days.where(
        m["member_class"] == "PM"
    ).astype("Int64")

    m["project_role_2026"] = _project_role(m, oc)
    m["whatsapp_groups"] = _whatsapp(m)

    # Current-year fee status and historical lapses.
    cur = fees[fees["fee_year"] == AS_OF.year].set_index("member_id")
    m["fee_status_current"] = m["member_id"].map(cur["status"]).fillna("No record")
    m["fee_submission_date"] = m["member_id"].map(cur["submission_date"])
    lapses = fees[fees["status"] == "Unpaid"].groupby("member_id").size()
    m["lapse_count"] = m["member_id"].map(lapses).fillna(0).astype(int)
    prior_lapses = (
        fees[(fees["status"] == "Unpaid") & (fees["fee_year"] < AS_OF.year)]
        .groupby("member_id")
        .size()
    )
    m["prior_unpaid_years"] = m["member_id"].map(prior_lapses).fillna(0).astype(int)

    # Recency: months since the member's most recent lifecycle event that has
    # actually happened. Future-dated rows are excluded so a scheduled event
    # cannot make a disengaged member look active.
    past = events[_d(events["event_date"]) <= ref]
    last = _d(past.groupby("member_id")["event_date"].max())
    m["last_event_date"] = m["member_id"].map(last.dt.strftime("%Y-%m-%d"))
    months = m["member_id"].map(((ref - last).dt.days / 30.44).round(1))
    m["months_since_last_event"] = months

    m["full_name"] = m["first_name"].str.strip() + " " + m["last_name"].str.strip()
    m["years_membership"] = _years_between(m["date_joined"], AS_OF)
    m["is_active"] = m["member_status"].isin(
        ["Active", "Pending Induction", "Pending Fee", "Pending BOD Motion"]
    )

    # Roles last: it reads project_role_2026, which is computed above. This is
    # the one place the role record becomes a permission tier, so every
    # consumer downstream -- payloads, login, page guards -- agrees by
    # construction rather than by everyone remembering to call the same
    # helper.
    return roles.annotate(m)


def _fm_status(m: pd.DataFrame, deadline: pd.Series, ref: pd.Timestamp) -> pd.Series:
    teams = m["fm_teams_counted"]
    elapsed = deadline < ref
    status = pd.Series("Not Applicable", index=m.index, dtype=object)
    is_pm = m["member_class"] == "PM"
    status[is_pm & (teams >= 2)] = "Completed"
    status[is_pm & (teams == 1) & ~elapsed] = "In Progress (1/2)"
    status[is_pm & (teams == 0) & ~elapsed] = "Not Started"
    status[is_pm & (teams < 2) & elapsed] = "Overdue"
    # Members already inducted have met the requirement by definition.
    status[m["member_class"].isin(["FM", "SM"])] = "Completed"
    return status


def _project_role(m: pd.DataFrame, oc: pd.DataFrame) -> pd.Series:
    rank = {"Chairman": 3, "SO": 2, "OC": 1}
    cur = oc[oc["year"] == AS_OF.year].copy()
    cur["r"] = cur["project_role"].map(rank).fillna(0)
    top = cur.sort_values("r", ascending=False).drop_duplicates("member_id")
    return m["member_id"].map(top.set_index("member_id")["project_role"]).fillna("None")


def _whatsapp(m: pd.DataFrame) -> pd.Series:
    """Group membership is a rule, never a typed field (PRD 4.2)."""

    def groups(row) -> str:
        if row["is_bod_2026"] == "Y":
            return "PM; FM; SM"
        if row["member_status"] in ("Removed", "Resigned"):
            return ""
        return {"PM": "PM", "FM": "FM", "SM": "SM"}.get(row["member_class"], "")

    return m.apply(groups, axis=1)


def verify(m: pd.DataFrame, raw: pd.DataFrame) -> int:
    """Compare computed values against the spreadsheet's own columns.

    Returns the number of mismatched cells. PRD 11 asks for a 10-row spot
    check; this checks all 150 on every derived column the sheet also holds.
    """
    # (computed column, sheet column, row filter)
    pm_only = lambda df: df["member_class"] == "PM"  # noqa: E731
    checks = [
        ("age_calendar_year", "Age (2026)", None),
        ("fm_teams_counted", "OC Teams Joined (Counting)", pm_only),
        ("fm_deadline", "FM Requirement Deadline", None),
        ("fm_status", "FM Requirement Status", None),
        ("whatsapp_groups", "WhatsApp Group", None),
        ("project_role_2026", "Project Role (2026)", None),
    ]
    idx = m.set_index("member_id")
    rawi = raw.set_index("Member ID")
    total = 0
    for computed, original, flt in checks:
        if original not in rawi.columns:
            continue
        rows = idx if flt is None else idx[flt(idx)]
        got, want = rows[computed], rawi[original].reindex(rows.index)
        if computed == "fm_deadline":
            want = pd.to_datetime(want, errors="coerce").dt.strftime("%Y-%m-%d")
        if computed == "project_role_2026":
            want = want.fillna("None")
        if computed == "whatsapp_groups":
            want = want.fillna("")
        # Both sides go through the same normalisation, so a value that is
        # blank in the sheet and missing in the computed column compares
        # equal instead of reading as "nan" against "".
        norm = lambda s: (  # noqa: E731
            s.astype(str)
            .str.strip()
            .replace({"nan": "", "<NA>": "", "NaT": "", "None": ""})
            .str.replace(r"\.0$", "", regex=True)
        )
        a, b = norm(got), norm(want)
        diff = a.compare(b)
        scope = "" if flt is None else " (PM only)"
        if len(diff):
            print(f"  ! {computed:20} {len(diff):>3} differ vs '{original}'{scope}")
            print(diff.head(5).to_string())
        else:
            print(f"  OK {computed:20} matches '{original}' on all {len(a)} rows{scope}")
        total += len(diff)

    # Known, intentional deviation. Three members chair one project and
    # supervise another; the sheet's summary column records them as SO,
    # PRD 4.2 ranks Chairman above SO. The PRD is the spec, so we rank
    # Chairman -- the sheet's own "Chairman / SO Of (2026)" column shows
    # both roles for all three, so no information is lost either way.
    if total:
        print("\n  Note: project_role_2026 differences are expected where a member")
        print("  holds both roles. PRD 4.2 ranks Chairman > SO; the sheet does not.")
    return total
