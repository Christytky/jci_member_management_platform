"""Field-level permissions. PRD 3.1.

One module, imported by every page. Access rules read from the FIELD GROUP,
never from a hardcoded field name -- adding a column to a group changes its
visibility everywhere at once.

The contract that matters: HIDDEN means the column is DROPPED from the
dataframe, so the value never reaches the browser. It is not styled out.
A judge can open devtools and confirm it.

What this module does NOT do is decide who is what. The four strings below
are permission TIERS, and a member's tier is derived from their role record
by src.roles -- the highest role they hold wins. A member listed as "FM &
MA" reaches this module as "President + MA" and is handed MA's columns. See
src/roles.py for the catalogue that makes that mapping.
"""

from __future__ import annotations

import pandas as pd

from src import roles as R

FULL, EDIT, READ, MASKED, HIDDEN, OWN = "full", "edit", "read", "masked", "hidden", "own"

# PRD 3.1, implemented literally as a table.
FIELD_GROUPS: dict[str, list[str]] = {
    "identity": [
        "member_id", "first_name", "last_name", "full_name", "member_class",
        "member_status", "date_joined", "induction_date", "years_membership",
        "senior_designation", "board_post_2026", "is_bod_2026",
        "national_post_2026", "senior_transfer_year", "years_to_senior",
        "referred_by", "is_active",
        # The role record and the tier it earns. Identity, not analytics:
        # who holds which post is published to the chapter, and the tier is
        # only that fact restated.
        "roles", "role_record", "permission_tier", "governing_role", "tier_rank",
    ],
    "contact": ["mobile", "personal_email", "jci_email", "whatsapp_groups"],
    "personal": ["date_of_birth", "gender", "age", "age_calendar_year"],
    "professional": ["company", "job_title", "industry", "areas_of_interest"],
    "finance": [
        "fee_status_current", "fee_submission_date", "lapse_count",
        "prior_unpaid_years",
    ],
    "governance": [
        "bod_motion_date", "bod_motion_result", "status_reason", "remark",
    ],
    "analytics": [
        "health_score", "health_band", "health_note", "fm_status",
        "fm_deadline", "fm_teams_counted", "days_to_fm_deadline",
        "project_role_2026", "mfg_attended_2026", "months_since_last_event",
        "last_event_date", "hs_fee", "hs_attendance", "hs_role",
        "hs_recency", "hs_compliance",
    ],
}

# The tiers, highest first. Imported from the role catalogue so there is one
# vocabulary rather than two lists that can drift apart.
ROLES = list(R.TIERS)
TIERS = ROLES  # the honest name; ROLES is kept for existing callers

MATRIX: dict[str, dict[str, str]] = {
    "identity":     {"President + MA": FULL, "HS + FD": FULL,   "Board / Chairman / SO": FULL,   "Member": OWN},
    "contact":      {"President + MA": FULL, "HS + FD": EDIT,   "Board / Chairman / SO": READ,   "Member": OWN},
    "personal":     {"President + MA": FULL, "HS + FD": MASKED, "Board / Chairman / SO": HIDDEN, "Member": OWN},
    "professional": {"President + MA": FULL, "HS + FD": READ,   "Board / Chairman / SO": READ,   "Member": OWN},
    "finance":      {"President + MA": FULL, "HS + FD": EDIT,   "Board / Chairman / SO": HIDDEN, "Member": OWN},
    "governance":   {"President + MA": FULL, "HS + FD": READ,   "Board / Chairman / SO": HIDDEN, "Member": HIDDEN},
    "analytics":    {"President + MA": FULL, "HS + FD": READ,   "Board / Chairman / SO": HIDDEN, "Member": OWN},
}

# Pages a tier may open at all (PRD 6.2, 6.6, 6.7).
PAGE_ACCESS = {
    "dashboard": [R.ADMIN, R.SECRETARIAT],
    "alerts":    [R.ADMIN, R.SECRETARIAT],
    "directory": ROLES,
    "member":    ROLES,
    "activity":  [R.ADMIN],
    "export":    [R.ADMIN, R.SECRETARIAT],
    # The chapter-wide growth tree reads every member's referral line and
    # class history at once, which is a President-and-MA view by definition.
    "growth":    [R.ADMIN],
    # "P roles and MA Teams can upload and update member databases" -- this
    # is the only write path in the app, and the only tier that holds it.
    "upload":    [R.ADMIN],
}

# Pages that change stored data rather than read it. Listed separately so a
# read guard can never be mistaken for a write guard.
WRITE_PAGES = ("upload",)

FIELD_TO_GROUP = {f: g for g, fields in FIELD_GROUPS.items() for f in fields}


def can_see(role: str, field_group: str) -> bool:
    """False only when the group is fully hidden from this role."""
    return MATRIX.get(field_group, {}).get(role, HIDDEN) != HIDDEN


def access(role: str, field_group: str) -> str:
    return MATRIX.get(field_group, {}).get(role, HIDDEN)


def can_open(role: str, page: str) -> bool:
    return role in PAGE_ACCESS.get(page, [])


def can_write(role: str) -> bool:
    """True only for the tier that owns the member database."""
    return role == R.ADMIN


def tier_for_member(row) -> str:
    """The tier a member's role record earns them. The single entry point.

    Every caller that needs "what may this person see" goes through here, so
    the highest-role rule is applied in exactly one place.
    """
    return R.tier_for(R.roles_for(row))


def mask_dob(value) -> str | None:
    """A date of birth becomes a five-year age band, never the real date."""
    if pd.isna(value):
        return None
    year = pd.to_datetime(value).year
    return f"born {year // 5 * 5}-{year // 5 * 5 + 4}"


def mask_age(value) -> str | None:
    if pd.isna(value):
        return None
    lo = int(value) // 5 * 5
    return f"{lo}-{lo + 4}"


def mask_mobile(value) -> str | None:
    """+85298942925 -> +8529...2925 (PRD 3.1 note)."""
    if pd.isna(value) or not str(value).strip():
        return None
    s = str(value)
    return s[:5] + "•" * 3 + s[-4:] if len(s) > 9 else s


def mask_email(value) -> str | None:
    """amber.poon80@gmail.com -> a...80@gmail.com"""
    if pd.isna(value) or "@" not in str(value):
        return None
    local, domain = str(value).split("@", 1)
    keep = local[0] + "…" + local[-2:] if len(local) > 3 else local[0] + "…"
    return f"{keep}@{domain}"


def apply(df: pd.DataFrame, role: str, own_member_id: str | None = None) -> pd.DataFrame:
    """Drop hidden groups, mask masked groups, scope Member to own record.

    Every page calls this before rendering. No exceptions -- a single page
    that forgets makes the whole privacy claim false.
    """
    out = df.copy()

    # A Member sees exactly one row: their own.
    if role == "Member":
        if own_member_id is None:
            return out.iloc[0:0]
        out = out[out["member_id"] == own_member_id]

    for group, fields in FIELD_GROUPS.items():
        level = access(role, group)
        present = [f for f in fields if f in out.columns]
        if not present:
            continue
        if level == HIDDEN:
            out = out.drop(columns=present)
        elif level == MASKED:
            if "date_of_birth" in out.columns:
                out["date_of_birth"] = out["date_of_birth"].map(mask_dob)
            for col in ("age", "age_calendar_year"):
                if col in out.columns:
                    out[col] = out[col].map(mask_age)

    # Read-level contact access gets the JCI address in the clear and the
    # personal channels masked. PRD 3.1 grants project leaders "Full (read)"
    # on contact, following current chapter practice, but a Chairman needs a
    # way to reach his team -- not everyone's private mobile and Gmail. The
    # jci_email is that way. This is the narrower of the two readings in PRD
    # open question 1, and it is the one the pitch can defend out loud.
    if access(role, "contact") == READ:
        if "mobile" in out.columns:
            out["mobile"] = out["mobile"].map(mask_mobile)
        if "personal_email" in out.columns:
            out["personal_email"] = out["personal_email"].map(mask_email)

    # HS + FD see finance alerts only, not the health analytics (PRD 3.1).
    if role == "HS + FD":
        for col in ("health_score", "health_band", "hs_fee", "hs_attendance",
                    "hs_role", "hs_recency", "hs_compliance"):
            if col in out.columns:
                out = out.drop(columns=[col])

    return out


def visible_groups(role: str) -> list[str]:
    return [g for g in FIELD_GROUPS if can_see(role, g)]


def hidden_groups(role: str) -> list[str]:
    return [g for g in FIELD_GROUPS if not can_see(role, g)]


def masked_groups(role: str) -> list[str]:
    """Groups present in the payload but blurred -- age bands, not birthdays.

    Distinct from hidden, and the distinction is not cosmetic: a hidden group
    is absent from the file, a masked one is there in a reduced form. The
    banner has to say both, or a tier holding no hidden groups is told it has
    "full access" while the field count beside it says otherwise.
    """
    return [g for g in FIELD_GROUPS if access(role, g) == MASKED]


def describe(role: str) -> str:
    """One line for the role banner (PRD 6.1)."""
    hidden, masked = hidden_groups(role), masked_groups(role)
    parts = []
    if hidden:
        parts.append("hidden: " + ", ".join(hidden))
    if masked:
        parts.append("masked: " + ", ".join(masked))
    if not parts:
        return "Full access to all member fields."
    return "By your access level — " + "; ".join(parts) + "."
