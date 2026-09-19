"""Member health score. PRD 4.3.

Applies to PM and FM only. Senior Members are not project eligible, so
scoring them on project role would penalise them for a rule that does not
apply to them; they render "N/A -- not project eligible".
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# One dict, so "the weights are configurable per chapter" is true, not a claim.
WEIGHTS = {
    "fee": 0.30,
    "attendance": 0.25,
    "role": 0.20,
    "recency": 0.15,
    "compliance": 0.10,
}

MFG_TARGET = 6  # PRD 4.3: attendance = min(attended / 6, 1.0)
BANDS = [("Healthy", 70), ("Watch", 40), ("At risk", 0)]

SCORED_CLASSES = ("PM", "FM")


def _fee(m: pd.DataFrame) -> pd.Series:
    base = m["fee_status_current"].map(
        {"Paid": 1.0, "Waived": 1.0, "Pending": 0.6, "Unpaid": 0.0}
    ).fillna(0.0)
    return (base - 0.15 * m["prior_unpaid_years"]).clip(lower=0.0)


def _attendance(m: pd.DataFrame) -> pd.Series:
    return (m["mfg_attended_2026"] / MFG_TARGET).clip(upper=1.0)


def _role(m: pd.DataFrame) -> pd.Series:
    return m["project_role_2026"].map(
        {"Chairman": 1.0, "SO": 1.0, "OC": 0.7}
    ).fillna(0.0)


def _recency(m: pd.DataFrame) -> pd.Series:
    months = m["months_since_last_event"]
    return pd.Series(
        np.select(
            [months <= 3, months <= 6, months <= 12, months <= 24],
            [1.0, 0.8, 0.5, 0.25],
            default=0.0,
        ),
        index=m.index,
    ).where(months.notna(), 0.0)


def _compliance(m: pd.DataFrame) -> pd.Series:
    out = m["fm_status"].map(
        {
            "Completed": 1.0,
            "Not Applicable": 1.0,
            "In Progress (1/2)": 0.5,
            "Not Started": 0.5,
            "Overdue": 0.0,
        }
    ).fillna(0.0)
    out[m["member_status"] == "Pending BOD Motion"] = 0.0
    return out


def band(score: float | None) -> str:
    if score is None or pd.isna(score):
        return "N/A"
    for name, floor in BANDS:
        if score >= floor:
            return name
    return "At risk"


def score(enriched: pd.DataFrame) -> pd.DataFrame:
    """+ health_score, health_band and the five component scores."""
    m = enriched.copy()
    parts = {
        "fee": _fee(m),
        "attendance": _attendance(m),
        "role": _role(m),
        "recency": _recency(m),
        "compliance": _compliance(m),
    }
    total = sum(WEIGHTS[k] * v for k, v in parts.items()) * 100

    eligible = m["member_class"].isin(SCORED_CLASSES)
    m["health_score"] = total.round(0).where(eligible).astype("Int64")
    m["health_band"] = m["health_score"].map(lambda s: band(s) if pd.notna(s) else "N/A")
    m["health_note"] = np.where(eligible, "", "N/A - not project eligible")
    for k, v in parts.items():
        m[f"hs_{k}"] = (v * 100).round(0).where(eligible).astype("Int64")
    return m


def reasons(row: pd.Series) -> list[str]:
    """Plain-language drivers, worst first -- for 'Needs attention today'."""
    out = []
    if row["fee_status_current"] == "Unpaid":
        out.append("2026 fee unpaid")
    if row["prior_unpaid_years"]:
        out.append(f"{row['prior_unpaid_years']} prior unpaid year(s)")
    if row["fm_status"] == "Overdue":
        out.append("FM requirement overdue")
    if row["mfg_attended_2026"] <= 2:
        out.append(f"only {row['mfg_attended_2026']} of {MFG_TARGET} MFGs attended")
    if row["project_role_2026"] == "None":
        out.append("no project role in 2026")
    months = row["months_since_last_event"]
    if pd.notna(months) and months > 12:
        out.append(f"no activity in {int(months)} months")
    return out
