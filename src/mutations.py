"""Writes. The counterpart to permissions.py, and the only module that may
change a stored member field.

permissions.py answers "what may this permission level READ", and it has
always answered a second question too -- the MATRIX carries FULL and EDIT
levels that say who may WRITE. Nothing acted on them: apply() treats full,
edit and read identically, because every write went through replacing the
whole workbook. So the matrix promised an edit right the app never granted.

This module is that promise, kept. The rule is the same one the read path
uses, read from the same table:

    FULL or EDIT on a field's group  ->  that group's fields are writable
    READ, MASKED, HIDDEN, OWN        ->  refused

Three constraints shape everything below.

1. ONLY STORED COLUMNS ARE WRITABLE. Age, health score, fee status and the
   rest are recomputed on every read by derived.py and health.py, and
   .cursorrules forbids storing them. A request to write one is refused by
   name rather than silently dropped -- a write that reports success and
   changes nothing is worse than one that refuses.

2. THE PERMISSION LEVEL IS CHECKED HERE, not in the web layer. The web
   layer re-checks it too, but this is the check of record: a field a level
   may not write is rejected in Python, beside the table that granted it.

3. LIFECYCLE CHANGES APPEND TO THE JOURNEY. status_events is append-only and
   the promotion ladder reads it, so changing a member's class or status
   writes an event as well as the column. Editing the column alone would
   leave the record saying FM while the timeline never showed an induction.

Nothing here rebuilds the payloads. The caller must -- see scripts/mutate.py
and the note on rebuild_required().
"""

from __future__ import annotations

import re
import sqlite3
from datetime import date

from src import db
from src import permissions as P
from src import roles as R

# --------------------------------------------------------------------------
# What a MATRIX level means on the write path.
#
# EDIT means exactly what it says: this level maintains these fields. HS + FD
# hold it on contact and finance, which is the secretariat keeping addresses
# current and the Finance Director marking a fee paid.
#
# FULL is a READ level for everyone except the level that owns the member
# database. That distinction is load-bearing, and reading it the other way
# would have been a real hole: identity is FULL for ALL FOUR levels, because
# who holds which post is published to the chapter. Treating that as a write
# right would let a project Chairman rewrite anyone's name and join date --
# and would let an Honorary Secretary type "P" into their own board post
# column and be President + MA on the next page load. The read matrix grants
# sight of the post record; only the level that owns access may set it.
#
# OWN is a read level too. Self-service updates are a chapter policy
# decision rather than a technical one -- the member record is the chapter's
# record OF a member, and the MA team owns it today.
# --------------------------------------------------------------------------
EDIT_ONLY = (P.EDIT,)
OWNER_ALSO = (P.FULL, P.EDIT)


class Refused(Exception):
    """A write that the permission level, the catalogue or a value forbids.

    Carries a sentence meant to be shown to the person who tried it.
    """


class Field:
    """One writable column: where it lives, and what counts as a valid value."""

    __slots__ = ("name", "label", "group", "kind", "choices", "table")

    def __init__(self, name, label, group, kind="text", choices=None, table="members"):
        self.name, self.label, self.group = name, label, group
        self.kind, self.choices, self.table = kind, choices, table

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "label": self.label,
            "group": self.group,
            "kind": self.kind,
            "choices": list(self.choices) if self.choices else None,
        }


CLASSES = ("PM", "FM", "SM")
STATUSES = (
    "Active", "Pending Induction", "Pending Fee", "Pending BOD Motion",
    "Resigned", "Removed",
)
FEE_STATUSES = ("Paid", "Unpaid", "Pending", "Waived")
YES_NO = ("Y", "N")

# Every post code the catalogue knows, offered as the choice list for the
# three post columns. Typing a code the catalogue does not know is exactly
# the mistake that silently drops a member to the Member level for a year.
BOARD_POSTS = tuple(c for c, r in R.CATALOGUE.items() if r.kind == R.BOARD)
NATIONAL_POSTS = tuple(c for c, r in R.CATALOGUE.items() if r.kind == R.NATIONAL)
HONOURS = tuple(c for c, r in R.CATALOGUE.items() if r.kind == R.HONOUR)


def _f(*args, **kwargs) -> tuple[str, Field]:
    field = Field(*args, **kwargs)
    return field.name, field


# --------------------------------------------------------------------------
# The writable catalogue. One row per STORED column, each tagged with the
# field group that governs it -- the same group permissions.MATRIX keys on,
# so a column added to a group becomes writable to that group's editors
# without a second table being edited.
#
# member_id is absent deliberately: it is the key every other table joins
# on, so it is set once at creation and never edited.
# --------------------------------------------------------------------------
WRITABLE: dict[str, Field] = dict(
    [
        # identity
        _f("first_name", "First name", "identity"),
        _f("last_name", "Last name", "identity"),
        _f("member_class", "Class", "identity", "choice", CLASSES),
        _f("member_status", "Status", "identity", "choice", STATUSES),
        _f("date_joined", "Joined", "identity", "date"),
        _f("induction_date", "Inducted", "identity", "date"),
        _f("referred_by", "Referred by", "identity", "member"),
        _f("board_post_2026", "Board post", "identity", "choice", ("",) + BOARD_POSTS),
        _f("is_bod_2026", "On the Board", "identity", "choice", YES_NO),
        _f("national_post_2026", "National post", "identity", "choice", ("",) + NATIONAL_POSTS),
        _f("senior_designation", "Senior designation", "identity", "choice", ("",) + HONOURS),
        # contact
        _f("mobile", "Mobile", "contact", "mobile"),
        _f("personal_email", "Personal email", "contact", "email"),
        _f("jci_email", "JCI email", "contact", "email"),
        # personal
        _f("date_of_birth", "Date of birth", "personal", "date"),
        _f("gender", "Gender", "personal", "choice", ("M", "F")),
        # professional
        _f("company", "Company", "professional"),
        _f("job_title", "Job title", "professional"),
        _f("industry", "Industry", "professional"),
        _f("areas_of_interest", "Interests", "professional"),
        # governance
        _f("bod_motion_date", "Motion date", "governance", "date"),
        _f("bod_motion_result", "Motion result", "governance", "choice",
           ("", "Pending", "Approved")),
        _f("status_reason", "Status reason", "governance"),
        _f("remark", "Remark", "governance"),
        # analytics -- the one stored column in an otherwise derived group
        _f("mfg_attended_2026", "MFGs attended", "analytics", "int"),
        # finance lives in fee_records, not on the member row. The Finance
        # Director's actual edit is "mark this year's fee paid", so that is
        # the field offered, and it writes to the fee table.
        _f("fee_status_current", "Fee status (current year)", "finance", "choice",
           FEE_STATUSES, table="fee_records"),
        _f("fee_submission_date", "Fee submitted", "finance", "date", table="fee_records"),
    ]
)

# Columns that are computed on every read. Named so a write to one is
# refused with the reason rather than accepted and then overwritten by the
# next export.
DERIVED = tuple(
    f
    for f in P.FIELD_TO_GROUP
    if f not in WRITABLE and f not in ("member_id",)
)

# Changing either of these is a lifecycle event, not a correction.
LIFECYCLE = {
    "member_class": {
        "FM": "Inducted",
        "SM": "Transferred to Senior Member",
        "PM": "Joined as PM",
    },
    "member_status": {
        "Pending BOD Motion": "Tabled for BOD Motion",
        "Removed": "BOD Motion Approved - Removed",
        "Resigned": "BOD Motion Approved - Resigned",
    },
}


# --------------------------------------------------------------------------
# Permission questions. Each reads permissions.MATRIX; none keeps its own list.
# --------------------------------------------------------------------------
def can_edit_group(tier: str, group: str) -> bool:
    """True when this permission level may write the group's fields.

    Read off permissions.MATRIX, with FULL counting as a write right only
    for the level that owns the member database. See the note above
    EDIT_ONLY -- identity is FULL for everyone, so the other reading hands
    a project Chairman the chapter's identity records.
    """
    level = P.access(tier, group)
    allowed = OWNER_ALSO if P.can_write(tier) else EDIT_ONLY
    return level in allowed


def can_edit_field(tier: str, field: str) -> bool:
    f = WRITABLE.get(field)
    return bool(f) and can_edit_group(tier, f.group)


def editable_groups(tier: str) -> list[str]:
    return [g for g in P.FIELD_GROUPS if can_edit_group(tier, g)]


def editable_fields(tier: str) -> list[str]:
    return [n for n, f in WRITABLE.items() if can_edit_group(tier, f.group)]


def can_create(tier: str) -> bool:
    """Adding a member is owning the database, so it is the write level."""
    return P.can_write(tier)


def can_delete(tier: str) -> bool:
    """Erasing a record, as distinct from recording a departure.

    Removing someone FROM THE CHAPTER is a status change carrying a BOD
    motion, and it keeps the record. This is the other thing: destroying the
    row and every fee, event and OC line joined to it. Only the level that
    owns the member database holds it.
    """
    return P.can_write(tier)


def describe_write(tier: str) -> str:
    """One line for the UI: what this permission level may change."""
    groups = editable_groups(tier)
    if not groups:
        return f"{R.level_label(tier)}: read-only on member records."
    verb = "may add, edit and delete member records" if can_create(tier) else "may edit"
    return (
        f"{R.level_label(tier)}: you {verb} — "
        f"field access covers {', '.join(groups)}."
    )


# --------------------------------------------------------------------------
# Value checking. A stored value is a fact other modules compute from, so a
# bad one does not fail here -- it fails later, in derived.py, on a date that
# will not parse, or quietly, as a post code that drops a member to the
# Member level. Everything is checked before it reaches the table.
# --------------------------------------------------------------------------
MAX_TEXT = 300
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MOBILE_RE = re.compile(r"^\+852\d{8}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _blank(value) -> bool:
    return value is None or str(value).strip() == ""


def check(field: Field, value, known_ids: set[str] | None = None):
    """Return the value as it should be stored, or raise Refused.

    Empty always means NULL, never the string "None" -- that string is a
    real value in this data (project_role_2026 reads "None" for a member on
    no project), and letting the two blur is how a blank becomes a word.
    """
    if _blank(value):
        if field.name in ("first_name", "last_name", "member_class", "member_status"):
            raise Refused(f"{field.label} cannot be empty.")
        return None

    raw = str(value).strip()

    if field.kind == "choice":
        if raw not in field.choices:
            allowed = ", ".join(c for c in field.choices if c) or "—"
            raise Refused(f"{field.label} must be one of: {allowed}.")
        return raw

    if field.kind == "date":
        if not DATE_RE.match(raw):
            raise Refused(f"{field.label} must be a date as YYYY-MM-DD.")
        try:
            parsed = date.fromisoformat(raw)
        except ValueError as exc:
            raise Refused(f"{field.label} is not a real date.") from exc
        if parsed.year < 1900 or parsed.year > date.today().year + 5:
            raise Refused(f"{field.label} is outside the plausible range.")
        return raw

    if field.kind == "int":
        if not raw.lstrip("-").isdigit():
            raise Refused(f"{field.label} must be a whole number.")
        n = int(raw)
        if n < 0 or n > 365:
            raise Refused(f"{field.label} must be between 0 and 365.")
        return n

    if field.kind == "email":
        if not EMAIL_RE.match(raw):
            raise Refused(f"{field.label} must be an email address.")
        return raw.lower()

    if field.kind == "mobile":
        compact = raw.replace(" ", "")
        if not MOBILE_RE.match(compact):
            raise Refused(f"{field.label} must be a Hong Kong number as +852########.")
        return compact

    if field.kind == "member":
        if known_ids is not None and raw not in known_ids:
            raise Refused(f"{field.label} must be an existing member ID.")
        return raw

    if len(raw) > MAX_TEXT:
        raise Refused(f"{field.label} is longer than {MAX_TEXT} characters.")
    return raw


def _refuse_unwritable(field_name: str) -> None:
    """Name the reason a column cannot be written, rather than 'unknown field'."""
    if field_name == "member_id":
        raise Refused("A member ID is set when the record is created and never edited.")
    if field_name in DERIVED:
        group = P.FIELD_TO_GROUP.get(field_name, "?")
        raise Refused(
            f"{field_name} is derived, not stored — it is recomputed from the "
            f"{group} data on every read, so writing it would be overwritten by "
            "the next rebuild."
        )
    raise Refused(f"{field_name} is not a member field.")


def _guard(tier: str, field_name: str) -> Field:
    field = WRITABLE.get(field_name)
    if field is None:
        _refuse_unwritable(field_name)
    if not can_edit_group(tier, field.group):
        level = P.access(tier, field.group)
        raise Refused(
            f"{R.level_label(tier)} has {level} field access to "
            f"{field.group}, which does not include changing it."
        )
    return field


# --------------------------------------------------------------------------
# The writes themselves.
# --------------------------------------------------------------------------
def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(db.DB)
    con.execute("PRAGMA foreign_keys = ON")
    return con


def _member_ids(con) -> set[str]:
    return {r[0] for r in con.execute("SELECT member_id FROM members")}


def _current(con, member_id: str, column: str):
    row = con.execute(
        f"SELECT {column} FROM members WHERE member_id = ?", (member_id,)
    ).fetchone()
    if row is None:
        raise Refused(f"{member_id} is not a member of this chapter.")
    return row[0]


def _log_event(con, member_id: str, event_type: str, actor: str, reason: str | None,
               from_v=None, to_v=None, is_class=False) -> None:
    """Append to the journey. status_events is never updated in place."""
    seq = con.execute("SELECT COUNT(*) FROM status_events").fetchone()[0] + 1
    con.execute(
        "INSERT INTO status_events (event_id, member_id, event_date, event_type,"
        " from_status, to_status, from_class, to_class, whatsapp_change, reason,"
        " recorded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (
            f"EV-{seq:05d}",
            member_id,
            date.today().isoformat(),
            event_type,
            None if is_class else from_v,
            None if is_class else to_v,
            from_v if is_class else None,
            to_v if is_class else None,
            None,
            reason,
            actor,
        ),
    )


def update_field(tier: str, actor: str, member_id: str, field_name: str,
                 value, reason: str | None = None) -> dict:
    """Change one stored field on one member. The whole of Update.

    One field at a time is deliberate. A form that posts thirty columns
    cannot be checked against a permission matrix without unpicking which of
    them the level may actually write, and the version that silently drops
    the ones it may not is the version that looks like it worked.
    """
    field = _guard(tier, field_name)

    con = _connect()
    try:
        known = _member_ids(con)
        if member_id not in known:
            raise Refused(f"{member_id} is not a member of this chapter.")
        stored = check(field, value, known)

        if field.table == "fee_records":
            return _update_fee(con, actor, member_id, field, stored)

        before = _current(con, member_id, field.name)
        if (before or None) == (stored or None):
            return {"ok": True, "changed": False, "detail": f"{field.label} unchanged."}

        con.execute(
            f"UPDATE members SET {field.name} = ? WHERE member_id = ?",
            (stored, member_id),
        )

        # A class or status change is a lifecycle event, so the journey gets
        # a row as well as the column. Without this the record would read FM
        # while the timeline never showed an induction.
        event = LIFECYCLE.get(field.name, {}).get(str(stored))
        if event:
            _log_event(
                con, member_id, event, actor, reason, before, stored,
                is_class=(field.name == "member_class"),
            )
        con.commit()
        return {
            "ok": True,
            "changed": True,
            "field": field.name,
            "group": field.group,
            "before": before,
            "after": stored,
            "event": event,
            # Named so the caller can log a post change as what it is: a
            # change to somebody's access, not a change to their address.
            "grants_access": field.name in (
                "board_post_2026", "is_bod_2026", "national_post_2026",
                "member_class", "senior_designation",
            ),
            "detail": f"{field.label}: {before or '—'} → {stored or '—'}",
        }
    finally:
        con.close()


def _update_fee(con, actor: str, member_id: str, field: Field, stored) -> dict:
    """The finance group has no column on the member row.

    fee_status_current and fee_submission_date are derived by derived.py from
    fee_records for the current year, so the Finance Director's edit is a
    write to that year's fee row -- created if the member has none.
    """
    from src import derived

    year = derived.AS_OF.year
    column = "status" if field.name == "fee_status_current" else "submission_date"
    row = con.execute(
        "SELECT status, submission_date FROM fee_records WHERE member_id = ? AND fee_year = ?",
        (member_id, year),
    ).fetchone()

    if row is None:
        klass = _current(con, member_id, "member_class")
        con.execute(
            "INSERT INTO fee_records (member_id, fee_year, class_that_year, status,"
            " submission_date, remark) VALUES (?,?,?,?,?,?)",
            (member_id, year, klass, "Unpaid", None, f"Row opened by {actor}"),
        )
        before = None
    else:
        before = row[0] if column == "status" else row[1]

    if (before or None) == (stored or None):
        con.commit()
        return {"ok": True, "changed": False, "detail": f"{field.label} unchanged."}

    con.execute(
        f"UPDATE fee_records SET {column} = ? WHERE member_id = ? AND fee_year = ?",
        (stored, member_id, year),
    )
    con.commit()
    return {
        "ok": True,
        "changed": True,
        "field": field.name,
        "group": "finance",
        "before": before,
        "after": stored,
        "event": None,
        "grants_access": False,
        "detail": f"{field.label} {year}: {before or '—'} → {stored or '—'}",
    }


# --------------------------------------------------------------------------
# Create and Delete. Both are the member database itself changing shape, so
# both are the level that owns it -- President + MA -- and neither is
# reachable from a field-group edit right.
# --------------------------------------------------------------------------
NEW_REQUIRED = ("first_name", "last_name", "date_joined")

# A new member joins as a PM. Not offered as a choice: someone is inducted
# by a ceremony recorded on the journey, and a record that starts life as an
# FM is a member with no induction date and no requirement history.
NEW_DEFAULTS = {"member_class": "PM", "member_status": "Active"}


def next_member_id(con) -> str:
    """VJC-0151 after VJC-0150. Highest + 1, never count + 1.

    Counting rows would reissue the id of a deleted member, and that id is
    still written across status_events, fee_records and the activity log.
    """
    rows = con.execute("SELECT member_id FROM members").fetchall()
    highest = 0
    for (mid,) in rows:
        m = re.match(r"^VJC-(\d+)$", str(mid or ""))
        if m:
            highest = max(highest, int(m.group(1)))
    return f"VJC-{highest + 1:04d}"


def create_member(tier: str, actor: str, values: dict) -> dict:
    """Add a member. Every field is checked by the same rules Update uses."""
    if not can_create(tier):
        raise Refused(
            "Only the President and the MA team may add a member to the chapter."
        )

    con = _connect()
    try:
        known = _member_ids(con)
        clean: dict = dict(NEW_DEFAULTS)

        for name, raw in (values or {}).items():
            if _blank(raw) and name not in NEW_REQUIRED:
                continue
            field = _guard(tier, name)
            if field.table != "members":
                raise Refused(
                    f"{field.label} is recorded against a year, so it is set on the "
                    "member's record after they are added, not while adding them."
                )
            clean[name] = check(field, raw, known)

        missing = [
            WRITABLE[f].label for f in NEW_REQUIRED if _blank(clean.get(f))
        ]
        if missing:
            raise Refused("Still needed: " + ", ".join(missing) + ".")

        member_id = next_member_id(con)
        clean["member_id"] = member_id
        columns = ", ".join(clean)
        marks = ", ".join("?" * len(clean))
        con.execute(f"INSERT INTO members ({columns}) VALUES ({marks})", list(clean.values()))

        _log_event(
            con, member_id, "Joined as PM", actor,
            f"Record created by {actor}", None, clean["member_class"], is_class=True,
        )
        con.commit()
        return {
            "ok": True,
            "changed": True,
            "member_id": member_id,
            "detail": (
                f"Added {clean['first_name']} {clean['last_name']} as {member_id} "
                f"({clean['member_class']}, joined {clean['date_joined']})"
            ),
        }
    finally:
        con.close()


# Every table that carries a member_id. Listed here so a table added later
# is added here too rather than leaving rows behind under a reissued id.
CASCADE = ("status_events", "fee_records", "oc_participation", "accounts")


def delete_member(tier: str, actor: str, member_id: str, reason: str) -> dict:
    """Erase a record and everything joined to it.

    This is NOT how someone leaves the chapter. A departure is a status of
    Removed or Resigned carrying a BOD motion, and it KEEPS the record --
    that history is what the movement chart and the departure reasons are
    built from, and erasing it would rewrite the chapter's own past. This is
    the other thing: a record that should never have existed, or one a
    member has asked to have erased.

    How long a departed member's record is kept is a board decision and is
    not settled in this codebase. Until it is, this refuses to erase an
    active member -- the destructive path should not also be the convenient
    one for someone who simply resigned.
    """
    if not can_delete(tier):
        raise Refused(
            "Only the President and the MA team may erase a member record."
        )
    if _blank(reason) or len(str(reason).strip()) < 10:
        raise Refused(
            "Erasing a record needs a reason of at least 10 characters — it is "
            "written to the activity log and it is the only trace left."
        )

    con = _connect()
    try:
        row = con.execute(
            "SELECT first_name, last_name, member_status FROM members WHERE member_id = ?",
            (member_id,),
        ).fetchone()
        if row is None:
            raise Refused(f"{member_id} is not a member of this chapter.")
        first, last, member_status = row

        if member_status == "Active":
            raise Refused(
                f"{first} {last} is an Active member. Record the departure first — "
                "set their status to Resigned or Removed, which keeps the record and "
                "the reason — and erase only if the record itself should not exist."
            )

        counts = {}
        for table in CASCADE:
            counts[table] = con.execute(
                f"SELECT COUNT(*) FROM {table} WHERE member_id = ?", (member_id,)
            ).fetchone()[0]
            con.execute(f"DELETE FROM {table} WHERE member_id = ?", (member_id,))

        # Members this person referred. growth.py already treats a referrer
        # it cannot resolve as a root, so the column is left as the historical
        # fact it is -- but the person erasing the record is told.
        orphaned = con.execute(
            "SELECT COUNT(*) FROM members WHERE referred_by = ?", (member_id,)
        ).fetchone()[0]

        con.execute("DELETE FROM members WHERE member_id = ?", (member_id,))
        con.commit()

        joined = ", ".join(f"{n} {t.replace('_', ' ')}" for t, n in counts.items() if n)
        return {
            "ok": True,
            "changed": True,
            "member_id": member_id,
            "orphaned_referrals": orphaned,
            "detail": (
                f"Erased {first} {last} ({member_id}, {member_status})"
                + (f" and {joined}" if joined else "")
                + (f" · {orphaned} member(s) lose a recorded referrer" if orphaned else "")
                + f" · reason: {str(reason).strip()}"
            ),
        }
    finally:
        con.close()


def rebuild_required() -> str:
    """Why every caller must re-export after writing here.

    The payloads ARE the permission boundary -- each holds only the fields
    its level may see. A database that has moved on from them is a database
    whose access rules are stale, and a member added here is a member with
    no payload of their own until the export runs.
    """
    return "python scripts/export_json.py"
