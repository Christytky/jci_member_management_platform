"""Growth: the promotion ladder, the referral tree and the age rings.

Three views of the same question -- where is this chapter's next generation
coming from, and where has each member got to.

  promotion_history()  one member's climb, PM -> FM -> SM plus every post
                       held along the way. What a President opens when they
                       click a name.
  growth_tree()        the whole chapter as a referral lineage: who brought
                       whom in, and how far each line has carried.
  age_rings()          FM and PM average age against the 40-year ceiling.

Nothing here is stored. All three are computed from status_events and the
members frame at read time, so they cannot go stale the way a spreadsheet
tab does.
"""

from __future__ import annotations

import pandas as pd

from src import derived

SENIOR_AGE = derived.SENIOR_AGE  # 40 -- the ceiling the rings are drawn against

# The rungs of the class ladder, in order. Rank is what makes "highest
# reached" a comparison rather than a guess.
LADDER = [
    ("PM", "Provisional Member", 1),
    ("FM", "Full Member", 2),
    ("SM", "Senior Member", 3),
]
LADDER_RANK = {code: rank for code, _, rank in LADDER}
LADDER_LABEL = {code: label for code, label, _ in LADDER}

# How each recorded event reads on a growth ladder. kind:
#   "rung"        a change of membership class -- the promotion itself
#   "appointment" a post taken on
#   "milestone"   progress that is not itself a promotion
#   "setback"     the record moving the other way
EVENT_KINDS: dict[str, tuple[str, str]] = {
    "Joined as PM":                                 ("rung", "Joined as Provisional Member"),
    "Inducted":                                     ("rung", "Inducted as Full Member"),
    "Transferred to Senior Member":                 ("rung", "Transferred to Senior Member"),
    "Joined Board of Directors":                    ("appointment", "Joined the Board of Directors"),
    "Appointed as Officer":                         ("appointment", "Appointed an Officer"),
    "Appointed Chairman of a project":              ("appointment", "Appointed Project Chairman"),
    "Appointed SO of a project":                    ("appointment", "Appointed Supervising Officer"),
    "FM Requirement Completed":                     ("milestone", "Completed the FM requirement"),
    "OC Team Joined (counts toward FM requirement)": ("milestone", "Joined an OC team"),
    "FM Requirement Overdue":                       ("setback", "Missed the FM deadline"),
    "Tabled for BOD Motion":                        ("setback", "Tabled for a BOD motion"),
    "BOD Motion Approved - Removed":                ("setback", "Removed by BOD motion"),
    "BOD Motion Approved - Resigned":               ("setback", "Resigned, approved by BOD"),
}

PROMOTION_KINDS = ("rung", "appointment")


def _years_between(a: str | None, b: str | None) -> float | None:
    if not a or not b:
        return None
    d1, d2 = pd.to_datetime(a, errors="coerce"), pd.to_datetime(b, errors="coerce")
    if pd.isna(d1) or pd.isna(d2):
        return None
    return round((d2 - d1).days / 365.25, 1)


def promotion_history(member_id: str, events: pd.DataFrame, member: pd.Series | None = None) -> dict:
    """One member's climb, oldest first, with the gap between each step.

    `events` is already permission-scoped by the caller, so a role that may
    not read the governance reason on an event simply receives a frame
    without that column -- this function never reaches past what it is given.
    """
    rows = events[events["member_id"] == member_id].copy()
    if rows.empty:
        return {
            "member_id": member_id,
            "steps": [],
            "highest_class": None,
            "highest_label": None,
            "posts_held": [],
            "years_to_fm": None,
            "promotions": 0,
        }

    rows["_d"] = pd.to_datetime(rows["event_date"], errors="coerce")
    rows = rows.sort_values(["_d", "event_id"])

    steps: list[dict] = []
    prev_date: str | None = None
    joined_date: str | None = None
    inducted_date: str | None = None

    for _, e in rows.iterrows():
        kind, label = EVENT_KINDS.get(e["event_type"], ("milestone", e["event_type"]))
        date = None if pd.isna(e["_d"]) else e["_d"].strftime("%Y-%m-%d")
        to_class = e.get("to_class")
        to_class = None if pd.isna(to_class) else to_class

        if e["event_type"] == "Joined as PM":
            joined_date = date
        if e["event_type"] == "Inducted":
            inducted_date = date

        steps.append(
            {
                "event_id": e["event_id"],
                "date": date,
                "kind": kind,
                "label": label,
                "event_type": e["event_type"],
                "from_class": None if pd.isna(e.get("from_class")) else e.get("from_class"),
                "to_class": to_class,
                "from_status": None if pd.isna(e.get("from_status")) else e.get("from_status"),
                "to_status": None if pd.isna(e.get("to_status")) else e.get("to_status"),
                # Governance-scoped columns are dropped upstream for roles that
                # may not see them; .get keeps this function agnostic.
                "reason": None if pd.isna(e.get("reason")) else e.get("reason"),
                "recorded_by": None if pd.isna(e.get("recorded_by")) else e.get("recorded_by"),
                "rank": LADDER_RANK.get(to_class or "", 0),
                # Years since the previous step -- the number that makes a
                # stalled member obvious without reading every date.
                "gap_years": _years_between(prev_date, date),
            }
        )
        if date:
            prev_date = date

    reached = [s["to_class"] for s in steps if s["kind"] == "rung" and s["to_class"]]
    highest = max(reached, key=lambda c: LADDER_RANK.get(c, 0)) if reached else None
    posts = [s["label"] for s in steps if s["kind"] == "appointment"]

    return {
        "member_id": member_id,
        "steps": steps,
        "highest_class": highest,
        "highest_label": LADDER_LABEL.get(highest or "", highest),
        "posts_held": posts,
        "years_to_fm": _years_between(joined_date, inducted_date),
        "promotions": sum(1 for s in steps if s["kind"] in PROMOTION_KINDS),
    }


def growth_tree(m: pd.DataFrame) -> dict:
    """The chapter as a referral lineage: who brought whom in.

    `referred_by` is the only edge in the data that records one member
    causing another to exist, which is exactly what a growth tree is. A
    member with no recorded referrer is a root -- not an error; the chapter
    only started recording referrals recently.
    """
    cols = ["member_id", "full_name", "member_class", "member_status", "date_joined"]
    optional = ["referred_by", "permission_tier", "role_record", "health_band", "age"]
    have = [c for c in cols + optional if c in m.columns]
    df = m[have].copy()

    ids = set(df["member_id"])
    parent: dict[str, str | None] = {}
    for _, r in df.iterrows():
        ref = r.get("referred_by")
        ref = None if (ref is None or pd.isna(ref) or ref not in ids) else ref
        parent[r["member_id"]] = None if ref == r["member_id"] else ref

    children: dict[str, list[str]] = {i: [] for i in ids}
    for child, par in parent.items():
        if par:
            children[par].append(child)

    # Depth, guarded against a cycle in the source data rather than trusting
    # that referrals form a tree -- one bad row should not hang the page.
    depth: dict[str, int] = {}

    def depth_of(i: str, seen: set[str] | None = None) -> int:
        if i in depth:
            return depth[i]
        seen = seen or set()
        if i in seen:
            return 0
        par = parent.get(i)
        depth[i] = 0 if not par else depth_of(par, seen | {i}) + 1
        return depth[i]

    for i in ids:
        depth_of(i)

    # Descendants: the size of the line a member started, however deep.
    def line_size(i: str, seen: set[str] | None = None) -> int:
        seen = seen or set()
        if i in seen:
            return 0
        return sum(1 + line_size(c, seen | {i}) for c in children[i])

    records = df.set_index("member_id").to_dict(orient="index")
    nodes = []
    for i in sorted(ids):
        rec = records[i]
        nodes.append(
            {
                "member_id": i,
                "name": rec.get("full_name"),
                "member_class": rec.get("member_class"),
                "member_status": rec.get("member_status"),
                "date_joined": rec.get("date_joined"),
                "role_record": rec.get("role_record"),
                "permission_tier": rec.get("permission_tier"),
                "referred_by": parent[i],
                "depth": depth[i],
                "direct_recruits": len(children[i]),
                "line_size": line_size(i),
            }
        )

    rooted = [n for n in nodes if n["referred_by"] is None and n["direct_recruits"] > 0]
    return {
        "nodes": nodes,
        "roots": sorted(
            [n["member_id"] for n in nodes if n["referred_by"] is None],
            key=lambda i: -next(x["line_size"] for x in nodes if x["member_id"] == i),
        ),
        "stats": {
            "total": len(nodes),
            "with_referrer": sum(1 for n in nodes if n["referred_by"]),
            "recruiters": len(rooted) + sum(
                1 for n in nodes if n["referred_by"] and n["direct_recruits"] > 0
            ),
            "max_depth": max((n["depth"] for n in nodes), default=0),
            "largest_line": max((n["line_size"] for n in nodes), default=0),
        },
        "top_recruiters": sorted(
            [n for n in nodes if n["direct_recruits"] > 0],
            key=lambda n: (-n["direct_recruits"], -n["line_size"], n["name"] or ""),
        )[:8],
    }


def age_rings(m: pd.DataFrame, classes: tuple[str, ...] = ("FM", "PM")) -> list[dict]:
    """Average age per class against the 40-year senior-transfer ceiling.

    Active members only. A Senior Member is by definition past 40, so
    averaging them against a 40 cap would draw a ring that is always full
    and says nothing -- FM and PM are the classes the ceiling applies to.
    """
    active = m[m["member_status"] == "Active"]
    out = []
    for cls in classes:
        ages = pd.to_numeric(active[active["member_class"] == cls]["age"], errors="coerce").dropna()
        if ages.empty:
            out.append(
                {"member_class": cls, "label": LADDER_LABEL.get(cls, cls), "count": 0,
                 "average_age": None, "pct_of_cap": 0.0, "years_headroom": None,
                 "oldest": None, "youngest": None, "within_two_years": 0, "cap": SENIOR_AGE}
            )
            continue
        avg = round(float(ages.mean()), 1)
        out.append(
            {
                "member_class": cls,
                "label": LADDER_LABEL.get(cls, cls),
                "count": int(len(ages)),
                "average_age": avg,
                # The arc length. Capped at 1.0 so a class that somehow
                # averages over 40 draws a full ring instead of overshooting.
                "pct_of_cap": round(min(avg / SENIOR_AGE, 1.0), 4),
                "years_headroom": round(SENIOR_AGE - avg, 1),
                "oldest": int(ages.max()),
                "youngest": int(ages.min()),
                # The number that turns the ring into a decision: how many
                # transfer out inside two years.
                "within_two_years": int((ages >= SENIOR_AGE - 2).sum()),
                "cap": SENIOR_AGE,
            }
        )
    return out
