"""The seven alert rules. PRD 6.3.

Each rule returns rows with a consistent shape so the Alerts page can
render them all from one frame. Thresholds live in THRESHOLDS -- they were
tuned against the real distribution (see PRD 6.3) and changing one is a
one-line edit, not a code change.
"""

from __future__ import annotations

import pandas as pd

from .derived import AS_OF, _d

THRESHOLDS = {
    "due_soon_days": 60,     # rule 1
    "induction_ready_days": 14,  # rule 3
    "senior_within_months": 12,  # rule 5
    "disengaged_mfg_max": 4,     # rule 6
    "motion_pending_days": 60,   # rule 7
}

COLUMNS = [
    "member_id", "member_name", "rule", "rule_no", "detail",
    "days", "owner_post", "severity",
]

ACTIVE_PM = lambda m: (m["member_class"] == "PM") & (m["member_status"] == "Active")  # noqa: E731


def _rows(sub: pd.DataFrame, rule_no, rule, owner, severity, detail, days=None):
    if sub.empty:
        return pd.DataFrame(columns=COLUMNS)
    return pd.DataFrame(
        {
            "member_id": sub["member_id"].values,
            "member_name": sub["full_name"].values,
            "rule": rule,
            "rule_no": rule_no,
            "detail": detail(sub).values,
            "days": (days(sub).values if days else None),
            "owner_post": owner,
            "severity": severity,
        }
    )


def build(enriched: pd.DataFrame, frames: dict[str, pd.DataFrame]) -> pd.DataFrame:
    m = enriched
    events = frames["events"]
    ref = pd.Timestamp(AS_OF)
    out = []

    # 1. Requirement due soon -- Active PM, deadline within 60 days, teams < 2
    d = m["days_to_fm_deadline"]
    sub = m[ACTIVE_PM(m) & (m["fm_teams_counted"] < 2) & d.between(0, THRESHOLDS["due_soon_days"])]
    out.append(_rows(
        sub, 1, "Requirement due soon", "MAO", "Watch",
        lambda s: s["fm_teams_counted"].map(lambda t: f"{t} of 2 OC teams joined")
        + " - deadline " + s["fm_deadline"],
        lambda s: s["days_to_fm_deadline"],
    ))

    # 2. Requirement overdue -- Active PM, deadline passed, teams < 2
    sub = m[ACTIVE_PM(m) & (m["fm_teams_counted"] < 2) & (d < 0)]
    out.append(_rows(
        sub, 2, "Requirement overdue", "MAD", "At risk",
        lambda s: s["fm_teams_counted"].map(lambda t: f"{t} of 2 OC teams joined")
        + " - deadline was " + s["fm_deadline"],
        lambda s: -s["days_to_fm_deadline"],
    ))

    # 3. Ready for induction -- teams >= 2, no induction date, completed > 14 days ago
    counted = frames["oc"][frames["oc"]["counts_toward_fm"] == "Y"].copy()
    counted["date_joined_project"] = pd.to_datetime(counted["date_joined_project"])
    second = (
        counted.sort_values("date_joined_project")
        .groupby("member_id")
        .nth(1)
        .set_index("member_id")["date_joined_project"]
    )
    # A member mid-removal is not a candidate for induction, so Pending BOD
    # Motion is excluded -- otherwise the HS gets told to induct someone the
    # board is in the middle of removing.
    ready = m[
        (m["fm_teams_counted"] >= 2)
        & m["induction_date"].isna()
        & (m["member_status"] != "Pending BOD Motion")
    ].copy()
    ready["completed_on"] = ready["member_id"].map(second)
    ready["since"] = (ref - ready["completed_on"]).dt.days
    sub = ready[ready["since"] > THRESHOLDS["induction_ready_days"]]
    out.append(_rows(
        sub, 3, "Ready for induction", "HS", "Action",
        lambda s: "Requirement met "
        + s["completed_on"].dt.strftime("%Y-%m-%d").fillna("-")
        + " - not yet inducted",
        lambda s: s["since"],
    ))

    # 4. Fee unpaid -- current year Unpaid.
    # Not scoped to active members: arrears left behind by a removed or
    # resigned member are exactly what the FD needs to see, to write off or
    # to chase. The member's status is carried in the detail so the two
    # cases are told apart on screen.
    sub = m[m["fee_status_current"] == "Unpaid"]
    out.append(_rows(
        sub, 4, "Fee unpaid", "FD", "At risk",
        lambda s: f"{AS_OF.year} subscription unpaid - " + s["member_status"]
        + s["prior_unpaid_years"].map(lambda n: f", {n} prior unpaid year(s)" if n else ""),
        lambda s: s["prior_unpaid_years"],
    ))

    # 5. Senior transfer due -- FM turning 40 within 12 months
    horizon = THRESHOLDS["senior_within_months"] / 12
    sub = m[
        (m["member_class"] == "FM")
        & m["is_active"]
        & m["years_to_senior"].notna()
        & (m["years_to_senior"] <= horizon)
        & (m["years_to_senior"] >= 0)
    ]
    out.append(_rows(
        sub, 5, "Senior transfer due", "HS", "Watch",
        lambda s: "Turns 40 in " + s["senior_transfer_year"].astype(str),
        lambda s: s["years_to_senior"] * 365,
    ))

    # 6. Disengaged member -- Active FM, MFG <= 4 and no project role
    sub = m[
        (m["member_class"] == "FM")
        & (m["member_status"] == "Active")
        & (m["mfg_attended_2026"] <= THRESHOLDS["disengaged_mfg_max"])
        & (m["project_role_2026"] == "None")
    ]
    out.append(_rows(
        sub, 6, "Disengaged member", "MAD", "Watch",
        lambda s: s["mfg_attended_2026"].astype(str) + " MFGs attended, no project role",
        lambda s: s["months_since_last_event"],
    ))

    # 7. Motion pending -- tabled for BOD motion and still unresolved.
    # Measured from the date the member was TABLED, taken from status_events,
    # not from members.bod_motion_date: that column holds the date of the
    # board meeting the motion is listed for, which is usually in the future.
    # Ageing a backlog against a future date would report every stuck motion
    # as negative days old.
    tabled = (
        events[events["event_type"] == "Tabled for BOD Motion"]
        .assign(d=lambda x: _d(x["event_date"]))
        .groupby("member_id")["d"]
        .min()
    )
    # Every unresolved motion is surfaced, not only stale ones: an open
    # motion is an open decision the HS is carrying either way. The 60-day
    # threshold escalates severity instead of filtering rows, so a backlog
    # cannot go invisible simply by being recent.
    sub = m[m["bod_motion_result"] == "Pending"].copy()
    sub["tabled_on"] = sub["member_id"].map(tabled)
    sub["since"] = (ref - sub["tabled_on"]).dt.days
    out.append(_rows(
        sub, 7, "Motion pending", "HS",
        None,  # per-row, set below
        lambda s: "Tabled " + s["tabled_on"].dt.strftime("%Y-%m-%d").fillna("-")
        + ", board date " + s["bod_motion_date"].fillna("not set"),
        lambda s: s["since"],
    ))
    if not sub.empty:
        out[-1]["severity"] = [
            "At risk" if d > THRESHOLDS["motion_pending_days"] else "Action"
            for d in sub["since"].fillna(0)
        ]

    df = pd.concat(out, ignore_index=True)
    df["days"] = pd.to_numeric(df["days"], errors="coerce").round(0).astype("Int64")
    return df.sort_values(["rule_no", "days"], ascending=[True, False]).reset_index(drop=True)


def counts(alerts: pd.DataFrame) -> dict[int, int]:
    return alerts.groupby("rule_no").size().to_dict()
