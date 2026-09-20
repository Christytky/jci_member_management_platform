"""Roles and permission tiers -- deliberately two different things.

Until now the two were one string: a member's role record *was* their
access level, so "President + MA" had to be typed into a persona table by
hand and a member who held two posts had to be assigned one of them.

That is wrong in both directions. A member holds *roles* -- a class (PM /
FM / SM), a board post, a project post, a senior designation -- and may
hold several at once. Access is a *tier*, and there are only four of them.
The tier is derived, never stored: it is the tier of the HIGHEST role the
member holds.

  Peter Lee, role record "FM & MA"
      roles  -> [FM (tier Member, rank 1), MA (tier President + MA, rank 4)]
      tier   -> President + MA          <- the highest, not the first
      access -> everything MA may see

Adding a post to a member changes their access the moment the record is
saved. Nothing else has to be edited.
"""

from __future__ import annotations

import pandas as pd

# --------------------------------------------------------------------------
# The four permission tiers. These strings are the keys of permissions.MATRIX
# and of PAGE_ACCESS, so they are the one vocabulary access rules speak.
# --------------------------------------------------------------------------
ADMIN = "President + MA"
SECRETARIAT = "HS + FD"
LEADER = "Board / Chairman / SO"
MEMBER = "Member"

TIERS = [ADMIN, SECRETARIAT, LEADER, MEMBER]

# Higher wins. This is the whole of "use the highest role as the standard".
TIER_RANK: dict[str, int] = {ADMIN: 4, SECRETARIAT: 3, LEADER: 2, MEMBER: 1}

# Kinds of role, in the order a member's role record reads.
CLASS, BOARD, NATIONAL, PROJECT, HONOUR = (
    "class", "board", "national", "project", "honour",
)


class Role:
    __slots__ = ("code", "label", "kind", "tier")

    def __init__(self, code: str, label: str, kind: str, tier: str):
        self.code, self.label, self.kind, self.tier = code, label, kind, tier

    @property
    def rank(self) -> int:
        return TIER_RANK[self.tier]

    def as_dict(self) -> dict:
        return {
            "code": self.code,
            "label": self.label,
            "kind": self.kind,
            "tier": self.tier,
            "rank": self.rank,
        }

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        return f"Role({self.code}, {self.tier})"


def _r(code, label, kind, tier) -> tuple[str, Role]:
    return code, Role(code, label, kind, tier)


# --------------------------------------------------------------------------
# The catalogue. One row per role a member can actually hold, each pinned to
# exactly one tier. This table is the only place a post is granted access;
# there is no second list anywhere that could disagree with it.
# --------------------------------------------------------------------------
CATALOGUE: dict[str, Role] = dict(
    [
        # Membership class -- what almost everyone is, and nothing more.
        _r("PM", "Provisional Member", CLASS, MEMBER),
        _r("FM", "Full Member", CLASS, MEMBER),
        _r("SM", "Senior Member", CLASS, MEMBER),

        # The MA team and the President. These are the people who own the
        # member database, so they are the only tier that may write to it.
        _r("P", "President", BOARD, ADMIN),
        _r("MAD", "Membership Affairs Director", BOARD, ADMIN),
        _r("MAO", "Membership Affairs Officer", BOARD, ADMIN),

        # Secretariat and finance: the records they keep, and no analytics.
        _r("HS", "Honorary Secretary", BOARD, SECRETARIAT),
        _r("FD", "Finance Director", BOARD, SECRETARIAT),
        _r("FACC", "Finance & Audit Committee Chairman", BOARD, SECRETARIAT),

        # Board, directors and officers: rosters, not personal data.
        _r("IPP", "Immediate Past President", BOARD, LEADER),
        _r("VP", "Vice President", BOARD, LEADER),
        _r("SMO", "Senior Members Officer", BOARD, LEADER),
        _r("CD", "Community Director", BOARD, LEADER),
        _r("LD", "Local Director", BOARD, LEADER),
        _r("LDD", "Leadership Development Director", BOARD, LEADER),
        _r("LDO", "Leadership Development Officer", BOARD, LEADER),
        _r("YAD", "Youth Affairs Director", BOARD, LEADER),
        _r("IAD", "International Affairs Director", BOARD, LEADER),
        _r("PRD", "Public Relations Director", BOARD, LEADER),
        _r("SDGD", "SDG Director", BOARD, LEADER),
        _r("BAD", "Business Affairs Director", BOARD, LEADER),
        _r("BOD", "Board of Directors", BOARD, LEADER),

        # National posts. Held alongside a chapter post; never raise access
        # above LEADER on their own, because the data lives in this chapter.
        _r("NVP", "National Vice President", NATIONAL, LEADER),
        _r("NLDD", "National LD Director", NATIONAL, LEADER),
        _r("NLDO", "National LD Officer", NATIONAL, LEADER),
        _r("NGLC", "National GLC Officer", NATIONAL, LEADER),
        _r("NRRO", "National RR Officer", NATIONAL, LEADER),
        _r("NIAO", "National IA Officer", NATIONAL, LEADER),

        # Project posts. A Chairman needs his team's roster, not the chapter's
        # dates of birth -- so LEADER, and OC is no elevation at all.
        _r("Chairman", "Project Chairman", PROJECT, LEADER),
        _r("SO", "Supervising Officer", PROJECT, LEADER),
        _r("OC", "Organising Committee", PROJECT, MEMBER),

        # Honorifics. Recognition, never access.
        _r("PP", "Past President", HONOUR, MEMBER),
        _r("PNP", "Past National President", HONOUR, MEMBER),
        _r("Senator", "JCI Senator", HONOUR, MEMBER),
        _r("HLP", "Honorary Life Patron", HONOUR, MEMBER),
        # Advisory, not administrative: SMCC advises the board, it does not
        # keep the member record, so it grants nothing.
        _r("SMCC", "Senior Members Consultative Committee", HONOUR, MEMBER),
    ]
)

# Posts whose codes the workbook writes but the catalogue does not know are
# not silently dropped -- see unknown_roles() and scripts/verify.py.
DEFAULT_TIER = MEMBER


def role(code: str) -> Role | None:
    return CATALOGUE.get(code)


def tier_of(code: str) -> str:
    r = CATALOGUE.get(code)
    return r.tier if r else DEFAULT_TIER


def label_of(code: str) -> str:
    r = CATALOGUE.get(code)
    return r.label if r else code


def _clean(value) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if value is pd.NA or value is pd.NaT:
        return None
    s = str(value).strip()
    return s or None


def roles_for(row) -> list[str]:
    """Every role code this member holds, highest tier first.

    `row` is one row of the enriched members frame (a Series or a dict).
    Reading it here -- rather than from a hand-maintained persona table --
    is what makes the role record the single source of truth.
    """
    get = row.get if hasattr(row, "get") else (lambda k, d=None: row[k] if k in row else d)
    codes: list[str] = []

    def add(code: str | None):
        if code and code not in codes:
            codes.append(code)

    add(_clean(get("member_class")))
    add(_clean(get("board_post_2026")))
    if _clean(get("is_bod_2026")) == "Y":
        add("BOD")
    add(_clean(get("national_post_2026")))

    project = _clean(get("project_role_2026"))
    if project and project != "None":
        add(project)

    for honour in (_clean(get("senior_designation")) or "").replace("/", ",").split(","):
        add(_clean(honour))

    return sorted(codes, key=lambda c: (-TIER_RANK[tier_of(c)], c))


def tier_for(codes: list[str]) -> str:
    """The highest tier among the roles held. The permission standard."""
    if not codes:
        return MEMBER
    return max((tier_of(c) for c in codes), key=lambda t: TIER_RANK[t])


def governing_role(codes: list[str]) -> str | None:
    """The single role that decided the tier -- what the UI shows as 'via'."""
    ranked = [c for c in codes if TIER_RANK[tier_of(c)] == TIER_RANK[tier_for(codes)]]
    return ranked[0] if ranked else None


def describe(codes: list[str]) -> str:
    """'FM & MAD' -- the role record, rendered the way the chapter writes it."""
    return " & ".join(codes) if codes else "—"


def annotate(m: pd.DataFrame) -> pd.DataFrame:
    """Add roles / permission_tier / governing_role to the members frame.

    Called once in derived.enrich(), so every consumer -- payload export,
    login, page guards -- reads the same three columns and cannot drift.
    """
    out = m.copy()
    code_lists = [roles_for(row) for _, row in out.iterrows()]
    out["roles"] = ["; ".join(c) for c in code_lists]
    out["role_record"] = [describe(c) for c in code_lists]
    out["permission_tier"] = [tier_for(c) for c in code_lists]
    out["governing_role"] = [governing_role(c) for c in code_lists]
    out["tier_rank"] = [TIER_RANK[t] for t in out["permission_tier"]]
    return out


def unknown_roles(m: pd.DataFrame) -> set[str]:
    """Role codes present in the data but missing from CATALOGUE.

    An unknown code falls back to MEMBER, which fails safe -- but silently,
    so verify.py surfaces the set rather than letting a new board post go
    unnoticed for a year.
    """
    seen: set[str] = set()
    for _, row in m.iterrows():
        seen.update(roles_for(row))
    return seen - set(CATALOGUE)
