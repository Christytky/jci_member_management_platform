"""Database access. Loads the whole thing into pandas once (PRD 7)."""

from __future__ import annotations

import sqlite3
from functools import lru_cache
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "members.db"

TABLES = {
    "members": "members",
    "events": "status_events",
    "fees": "fee_records",
    "oc": "oc_participation",
    "projects": "projects",
    "accounts": "accounts",
}


@lru_cache(maxsize=1)
def get_frames() -> dict[str, pd.DataFrame]:
    """dict of DataFrames, keys: members, events, fees, oc, projects, accounts."""
    if not DB.exists():
        raise SystemExit(f"{DB} not found -- run: python scripts/load_data.py")
    con = sqlite3.connect(DB)
    try:
        return {k: pd.read_sql_query(f"SELECT * FROM {t}", con) for k, t in TABLES.items()}
    finally:
        con.close()
