# Smart Member Management Platform

**A membership system for a JCI chapter that replaces the shared spreadsheet — one live member record, a complete movement history, and access granted by post instead of by emailing a file.**

Built for the JCI Innovation Hackathon, using JCI Victoria's membership data as the working case.

<img width="2880" height="1800" alt="image" src="https://github.com/user-attachments/assets/bdb49119-9d88-47d2-87d3-537f28ea28fc" />

---

## The problem

A JCI chapter of 150 members is typically run out of one Excel workbook. That workbook has to answer questions it was never built for:

- *Which Prospective Members are past their six-month induction deadline?*
- *Who hasn't paid this year, and who also owes for last year?*
- *Which motions has the board been sitting on for two months?*
- *Who is quietly disengaging — no project role, barely attending?*

Answering any of those means filtering by hand. And sharing the answer means sending the whole file, which means sending every member's date of birth, mobile number, fee arrears and removal reason to whoever needed one column.

This project takes the same data and makes it answer those questions itself — while giving each officer only the fields their post actually requires.

---

## What it does

| | |
|---|---|
| **Chapter dashboard** | Five KPIs, plus a movement chart covering every join, induction, senior transfer and departure since 1965 — history the spreadsheet holds but never shows. |
| **Seven alert rules** | 63 open items across the chapter right now: requirements due and overdue, members ready for induction, unpaid fees, senior transfers coming up, disengaged members, and motions still pending. Each names the post that owns it. |
| **Member health score** | A 0–100 score per member from five weighted signals, with the reasons in plain language — *"2026 fee unpaid, no project role in 2026"* — not just a number. |
| **Member directory & detail** | Every member's record, their journey timeline, and their health breakdown — filtered to what your post may see. |
| **Growth tree** | The chapter as a referral lineage — who brought whom in, how deep each line runs, and who is actually growing the chapter. President and MA only. |
| **Promotion history** | Every member's climb, PM → FM → SM, with the gap between each step written on the rail. Four years between joining and induction is a member the chapter nearly lost, and it is invisible in a column of dates. |
| **Age against the 40-year ceiling** | A circular diagram of FM and PM average age against the age at which a member transfers to Senior — and how many transfer out inside two years. |
| **Individual logins** | One account per member. Access is derived from the posts on their record, never chosen from a dropdown. |
| **Editing, scoped the same way** | The permission matrix always declared who may *change* a field, not just read one. Now it is enforced: the secretariat edits contact details and fees, the President and MA team edit everything, a project Chairman edits nothing — and a post can only be granted by the level that owns access. |
| **Role-scoped CSV export** | The export contains exactly the columns you could see on screen. A Chairman's export cannot leak a field a Chairman cannot read. |
| **Activity log** | Every sign-in, restricted-field view, export and upload, recorded with who, what and when — under a person's name, not a persona's. |

---

## The idea worth stealing: permissions that survive devtools

Most dashboards implement "hidden" as *rendered but not displayed*. The data is in the page; CSS just covers it. Anyone who opens developer tools can read it.

This build does it differently. Field-level permissions are applied **in Python, before the data is ever written to a file** — and the app renders those files in React Server Components.

```
                                    permissions.apply()
                                            │
Excel ──▶ SQLite ──▶ pandas logic ──▶ pre-filtered JSON ───▶ Next.js
        (8 tables)  derived fields    3 tier files +         server
                    health score      1 per member on        components
                    alert rules       the Member tier
                    roles -> tiers
                    permissions
```

So when the permission matrix says a Chairman cannot see fee status, the consequence is not a hidden `<div>`. The `fee_status_current` column is **dropped from the DataFrame**, never written to `payload.chairman.json`, never present in the server render, and never sent to the browser. There is nothing in devtools to find.

The concrete difference, same 150 members, different post:

| Signed in as | Post | Permission level | Columns | Editable | Members | Alerts |
|---|---|---|---:|---|---:|---:|
| Xavier Tam | President | **Level 1** — President + MA | **58** | everything | 150 | 63 |
| Adrian Shum | Membership Affairs Officer | **Level 1** — President + MA | **58** | everything | 150 | 63 |
| Mavis Tsang | Honorary Secretary | **Level 2** — HS + FD | **51** | contact, finance | 150 | 42 |
| Oscar Szeto | Project Chairman | **Level 3** — Board / Chairman / SO | **30** | nothing | 150 | 0 |
| Ka Chun Siu | — (Full Member) | **Level 4** — Member | **54** | nothing | **1** (own record) | 0 |

The **Post** column is the headline post each of them holds, and it is the whole of what the screen shows. Xavier Tam's record also reads `BOD` and `FM`; the page says *President*, because that is the post the reader needs, and the rest sit in the tooltip.

A Member on the bottom row sees more columns than a Chairman above them, and that is correct: they see everything about *themselves* and nothing about anyone else. The file they are served contains one row.

Two guardrails keep it honest:

- `web/lib/data.ts` imports `server-only`, so the build **fails** if a client component ever imports payload access.
- `scripts/verify.py` reads the real values for a probe member out of SQLite and asserts those exact strings do not appear anywhere in the Chairman's JSON file.
- A Member's payload is not a filtered view of everyone — it is `web/data/members/<their id>.json`, a file that never contained anyone else. A bug in the request path cannot widen it.

---

## Posts are not permissions

Three different things used to share the word *role*, and the screens showed it. The vocabulary is now fixed, and it is the same in the UI, the CSV headers and the code:

| Term | What it is | Example |
|---|---|---|
| **Post** | A job a member holds. They may hold several. | President, Honorary Secretary, Project Chairman |
| **Permission level** | One of four, numbered 1 (most access) to 4. Derived from the posts held — the highest wins. | `Level 1 — President + MA` |
| **Field access** | What that level may do with one group of fields. | `full` / `edit` / `read` / `masked` / `hidden` |

The four levels, in order:

| Level | Who | Reads | Changes |
|---|---|---:|---|
| **Level 1** | President + MA | 58 fields | everything; add and erase records |
| **Level 2** | HS + FD | 51 fields | contact details, fee status |
| **Level 3** | Board / Chairman / SO | 30 fields | nothing |
| **Level 4** | Member | 54 fields, own record only | nothing |

In the code a permission level is still called a `tier` — it is the key of `permissions.MATRIX` and the `permission_tier` column — and that name is left alone. The fix was to stop showing it to people, not to rename a column and break the one vocabulary the access rules speak.

A member's **post record** lists every post they hold: `MAD & BOD & SO & FM`. Their **permission level** is one of four, and it is derived — **the highest post held wins**.

```
post record   MAD & BOD & SO & FM
              │     │     │    └── FM  ->  Member                 rank 1   Level 4
              │     │     └── SO       ->  Board / Chairman / SO  rank 2   Level 3
              │     └── BOD            ->  Board / Chairman / SO  rank 2   Level 3
              └── MAD                  ->  President + MA         rank 4   Level 1  <- wins

permission level   President + MA
shown on screen    Membership Affairs Director  ->  Level 1 - President + MA
```

**The level number is the inverse of the internal rank, and that is deliberate.** `TIER_RANK` counts *up* with seniority — `President + MA` is 4 — because it is the comparison key the highest-post-wins derivation runs `max()` over. People number levels the other way: level 1 is the top. Renumbering the rank would mean inverting every comparison in `roles.py` for no visible gain, so the display number is derived from it instead, as `level = 5 − rank`. [`scripts/verify.py`](scripts/verify.py) asserts the two are inverses for every pair, because reading the wrong one would label the President *Level 4* and no column count would catch it.

So a record reading `FM & MA` is an **MA** on this system, not a Full Member — the level is the highest of the posts held, never the first one listed and never the membership class. 39 of the 150 members hold a post that lifts them above their class; each one is a case where reading the first post, or the class, would have been wrong.

**The screens say it in words.** A record printed as `P & BOD & FM` asked the reader to know that `P` is the President, that `BOD` is a board seat, and that `FM` is not a post at all but the membership class everyone has — three unequal things joined by ampersands, with the most important one given no more weight than the least. Every screen now shows the **highest post, spelled out, and nothing else**: *President*, with `Board of Directors, Full Member` in the tooltip for anyone who wants the full record. The derivation is unchanged; only the reading of it is. [`web/lib/posts.ts`](web/lib/posts.ts) does the mapping, from the catalogue [`src/roles.py`](src/roles.py) already exported and nothing read.

Everything follows from that single derivation:

- [`src/roles.py`](src/roles.py) holds the catalogue — one row per post a member can hold, each pinned to exactly one permission level. It is the only place a post grants access; there is no second list that could disagree with it.
- Adding a post to a member's record changes their access at their next page load. Nothing else is edited, and no administrator types a permission anywhere.
- An unrecognised post code falls back to the Member level — fails safe — and `verify.py` and the upload checker both name it rather than letting a new board post go unnoticed for a year.

The sign-in screen and the banner show both halves side by side, always: `President → Level 1 — President + MA`. The derivation is the explanation.

---

## Individual logins

Every member has an account. It carries a `member_id` and **no permissions of its own** — the permission level is re-read from the post record on every request, so a promotion takes effect immediately and a revoked post narrows access immediately, with no cookie to reissue.

- Username is the member's JCI Victoria address; passwords are stored as PBKDF2-HMAC-SHA256 (120,000 rounds) with a per-account salt.
- Sign-in failures are undifferentiated — a wrong password, an unknown address and a disabled account return the same message, so the form cannot be used to enumerate who is in the chapter.
- Removed and resigned members keep their record but cannot sign in. 140 of 150 accounts are enabled.
- The session cookie is HMAC-signed, `HttpOnly`, and holds a username and an expiry — never a permission. A tampered, swapped or expired cookie lands on `/login`.

This is what the old "viewing as" dropdown could never do. It could demonstrate the access model but not enforce it, and the activity log could only ever record *which persona was selected* — not who selected it. The Actor column now names a person.

Set `JCI_SESSION_SECRET` in production; the app refuses to issue a session without it.

---

## Who can write

There are two write paths, and the permission matrix decides both.

### Editing a record, field by field

The matrix has always carried an `edit` level — HS + FD on contact and finance — and for a long time nothing acted on it: `apply()` treated `full`, `edit` and `read` identically, because the only way to change anything was to replace the whole workbook. The matrix promised an edit right the app never granted. It grants it now.

| Permission level | May change | May not change |
|---|---|---|
| **Level 1** — President + MA | every field group; add and erase records | derived fields; a member ID |
| **Level 2** — HS + FD | contact details, fee status | names, posts, dates of birth, board motions |
| **Level 3** — Board / Chairman / SO | nothing | everything |
| **Level 4** — Member | nothing | everything |

Hover any field a post may change and a pencil appears; a post that may not change it sees the field exactly as it always looked, with no greyed-out control to explain. On the member record that is the profile, contact, employment and governance fields; on the fee table it is this year's status, which is where a Finance Director's edit right actually lands.

**`full` is a read level everywhere except at the top, and that distinction is load-bearing.** `identity` is `full` for *all four* levels, because who holds which post is published to the chapter. Reading that as a write right would have let a project Chairman rewrite anyone's name and join date — and would have let an Honorary Secretary type `P` into their own board post column and be President + MA on the next page load. Seeing the post record is not the same as setting it, so only the level that owns access may write an access-granting field. [`scripts/verify.py`](scripts/verify.py) asserts that path closed for all three lower levels.

Four more rules keep an edit honest:

- **Only stored columns are writable.** Age, health score, fee status and requirement status are recomputed on every read, so a write to one is refused *by name* — `health_score is derived, not stored` — rather than accepted and silently overwritten by the next rebuild. Correct the date of birth and the age follows.
- **A lifecycle change writes to the journey.** Changing a member's class to FM appends an `Inducted` event to the append-only `status_events` table, because a record reading FM whose timeline never showed an induction is a record that has lost its own history.
- **Every write rebuilds every payload.** The payloads *are* the permission boundary, so a database that has moved on from them is one whose access rules are stale. Mark a fee paid and the member's health score moves 49 → 79, rule 4 drops from 23 alerts to 22, and the Chairman's file still has no `fee_status_current` column in it.
- **A post change is logged as a post change.** The activity log separates `EDIT` from `EDIT_ACCESS`, because filing "gave this member a board seat" next to "corrected a phone number" loses the only distinction an audit is for.

### Adding and erasing a record

Both are **President + MA only**, and neither is reachable from a field-group edit right. Adding allocates the member ID rather than accepting one, starts the member as a PM, and writes their first journey event.

Erasing is deliberately not how someone leaves the chapter. A departure is a *status* of Resigned or Removed carrying a BOD motion, and it **keeps** the record — that history is what the movement chart and the departure reasons are built from. Erasing destroys the row and every fee, event, project line and login joined to it, so it refuses on an Active member, requires a typed reason of at least ten characters, and requires the member ID typed back to confirm. The reason goes to the activity log, where it is the only trace left.

### Replacing the whole database

**Only the President and the MA team** — the `President + MA` level — can upload and replace the member database, at `/upload`. Not a flag on an account: an MAO whose record reads `MAO & FM` reaches that page, and a Vice President whose record reads `BOD & VP & FM` does not.

Uploading is two steps, never one. A submitted workbook is **staged and checked** — sheet by sheet, row counts, missing columns, duplicate member IDs, unrecognised class or status values, and role codes the catalogue does not know — and nothing on disk changes. A second, separate action **applies** it: loads the workbook, recomputes every derived field, re-derives every tier, and rebuilds every payload. That last step is not optional, because the payloads *are* the permission boundary; a database that has moved on from them is one whose access rules are stale.

Every write path re-checks the permission level in the server action, and then [`src/mutations.py`](src/mutations.py) checks it again in Python beside the matrix that granted it — a server action is a POST endpoint, and a page not drawing a button is not an access control. None of the rules live in TypeScript: `web/lib/mutations.ts` shells out to `scripts/mutate.py` exactly the way the uploader shells out to the workbook checker, so there is no second copy of the matrix that could disagree with the first.

---

## Quick start

**Requirements:** Python 3.11+ and Node 20+.

```bash
git clone <your-fork-url> smart-member-management-platform
cd smart-member-management-platform

# 1. Build the data
pip install -r requirements.txt
python scripts/load_data.py      # Excel  -> data/members.db
python scripts/export_json.py    # SQLite -> web/data/payload.*.json + members/*.json
python scripts/verify.py         # 62 acceptance checks, exits 1 on failure

# 2. Run the app
cd web
npm install
npm run dev                      # http://localhost:3000
```

`data/members.db` and `web/data/*.json` are committed, **so you can skip step 1 entirely** and go straight to `npm install`. Re-run the Python only when the source workbook or the logic changes.

### Signing in

The app opens on `/login`. Expand **Demonstration logins** for seeded accounts across all four permission levels — click one to fill the form:

| Account | Post | Permission level | Password |
|---|---|---|---|
| `xaviertam@vjc.org.hk` | President | Level 1 — President + MA | `Victoria@0036` |
| `mavistsang@vjc.org.hk` | Honorary Secretary | Level 2 — HS + FD | `Victoria@0011` |
| `oscar.szeto@vjc.org.hk` | Project Chairman | Level 3 — Board / Chairman / SO | `Victoria@0003` |
| `kachun.siu@vjc.org.hk` | — (Full Member) | Level 4 — Member | `Victoria@0001` |

Every account follows `Victoria@<last four of member id>`. The panel is synthetic-data-only — set `JCI_DEMO_ACCOUNTS=0` and rebuild the payloads to ship an empty list.

### Exploring the four permission levels

Open a member record as **Xavier Tam**, then sign in as **Oscar Szeto** and open the same record: date of birth, fee status, motion history and health score are gone from the page — and from the payload behind it. Then sign in as the President and open the **Activity log** to see the rows those sign-ins and clicks just created, each under a person's name.

To see the write half, sign in as **Mavis Tsang** (HS + FD) and open any member. Hovering the mobile number shows a pencil; hovering the name does not, and neither does anything in the profile — she may read the whole identity group and change none of it. Open the fee table, set this year's status to **Paid**, and watch the health score and the alert count move: the value is not stored, it is recomputed from the row she just wrote. Then sign in as **Oscar Szeto** and hover the same fields — there are no pencils anywhere, and the fee table is not on his page at all.

Each level also has a different navigation: Chairman and Member have no Dashboard and no Alerts page, only President + MA can open the Activity log, the Growth tree and the member-database upload, and the age rings are absent from the HS + FD dashboard entirely — an average age is still an age, and that level holds masked access to the personal group.

---

## How the logic works

All four rule systems live in `src/`, in pandas, roughly 700 lines total. Each is a small module with its constants at the top, so a chapter can retune it without reading the code.

### Derived fields — [`src/derived.py`](src/derived.py)

Stored fields are facts; everything computed lives here and is recalculated on every read, never written back. That is what stops the record going stale the way a spreadsheet column does. Age, membership years, FM requirement deadline and status, OC teams counted, project role, senior transfer year, fee status, recency and WhatsApp group membership are all derived.

The reference date is pinned so every run and every machine produces an identical demo:

```bash
JCI_AS_OF=2026-09-19 python scripts/export_json.py   # the default; override to time-travel
```

### Health score — [`src/health.py`](src/health.py)

```python
WEIGHTS = {"fee": 0.30, "attendance": 0.25, "role": 0.20, "recency": 0.15, "compliance": 0.10}
```

One dict, so *"the weights are configurable per chapter"* is a fact rather than a claim. Bands are Healthy ≥ 70, Watch ≥ 40, At risk below. Senior Members are not project-eligible, so they render `N/A` rather than being penalised by a rule that does not apply to them.

### Alert rules — [`src/alerts.py`](src/alerts.py)

| # | Rule | Owner | Fires |
|---|---|---|---:|
| 1 | Requirement due soon — deadline within 60 days, under 2 OC teams | MAO | 4 |
| 2 | Requirement overdue — deadline passed, under 2 OC teams | MAD | 10 |
| 3 | Ready for induction — requirement met 14+ days ago, not inducted | HS | 6 |
| 4 | Fee unpaid — current year outstanding | FD | 23 |
| 5 | Senior transfer due — turns 40 within 12 months | HS | 5 |
| 6 | Disengaged member — ≤ 4 MFGs attended and no project role | MAD | 7 |
| 7 | Motion pending — tabled for BOD motion, still unresolved | HS | 8 |

Thresholds are a single `THRESHOLDS` dict. Three of these rules encode a judgement worth noting:

- **Rule 3** excludes members with status *Pending BOD Motion* — otherwise the system tells the Honorary Secretary to induct someone the board is mid-way through removing.
- **Rule 4** is *not* scoped to active members. Arrears left behind by someone who resigned are exactly what the Finance Director needs to see, to chase or to write off. The member's status appears in the alert detail so the two cases are distinguishable.
- **Rule 7** ages a motion from the date it was *tabled* (read from `status_events`), not from `members.bod_motion_date` — that column holds the upcoming board meeting date, so ageing against it would report every stuck motion as negative days old.

### Permissions — [`src/permissions.py`](src/permissions.py)

Access is read from a field's **group**, never a hardcoded field name, so adding a column to a group changes its visibility everywhere at once.

**Read the levels as both halves of one answer.** `full` and `edit` carry a write right; `read`, `masked`, `hidden` and `own` do not — except that `full` only adds writing for President + MA, the level that owns the member database. That is why `identity` reads `full` across the row and is still editable by exactly one level.

| Field group | Level 1<br>President + MA | Level 2<br>HS + FD | Level 3<br>Board / Chairman / SO | Level 4<br>Member |
|---|---|---|---|---|
| identity | full | full | full | own |
| contact | full | edit | read¹ | own |
| personal | full | masked² | **hidden** | own |
| professional | full | read | read | own |
| finance | full | edit | **hidden** | own |
| governance | full | read | **hidden** | **hidden** |
| analytics | full | read³ | **hidden** | own |

¹ At read level, the JCI address stays in the clear and mobile/personal email are masked (`+8529•••2925`, `a…80@gmail.com`) — see [open question 1](#two-open-design-questions).
² Date of birth becomes a five-year band (`born 1990-1994`); age becomes `30-34`.
³ Finance roles get finance alerts but not the health analytics.

**Hidden means the column is dropped.** Masked means the value is replaced before export. Neither is ever done in CSS or in a React component.

**Own is a read level.** A member sees their whole record and changes none of it — self-service updates are a chapter policy decision rather than a technical one, and the member record is the chapter's record *of* a member. Moving `own` into the write levels is a one-line change in [`src/mutations.py`](src/mutations.py) if the board decides otherwise.

Pages are gated the same way, on the permission level rather than on the account:

| Page | Level 1<br>President + MA | Level 2<br>HS + FD | Level 3<br>Board / Chairman / SO | Level 4<br>Member |
|---|:--:|:--:|:--:|:--:|
| Dashboard | ● | ● | — | — |
| Alerts | ● | ● | — | — |
| Directory | ● | ● | ● | own record |
| Member record | ● | ● | ● | own record |
| Growth tree | ● | — | — | — |
| Activity log | ● | — | — | — |
| Export | ● | ● | — | — |
| **Member database (replace)** | ● | — | — | — |
| **Edit a field** | every group | contact, fees | — | — |
| **Add / erase a record** | ● | — | — | — |

The circular age diagram follows the field group rather than the page: it ships only to a level holding **unmasked** access to `personal`, so it is absent from the HS + FD dashboard file, not hidden on their screen.

---

## Verification

`scripts/verify.py` runs 62 acceptance checks and exits non-zero on any failure:

- **Row counts** — 150 members, 443 status events, 409 fee records, 136 OC participations, 17 projects.
- **Derived fields vs. the source spreadsheet** — every derived column the workbook also holds is compared across all 150 rows, not spot-checked.
- **Alert counts** — all seven rules are asserted against their expected values (4, 10, 6, 23, 5, 7, 8). A rule that silently stops firing fails the build.
- **Health score** — every PM and FM scored, every SM `N/A`, all scores within 0–100.
- **Permissions (read)** — access provably narrows with level (58 > 51 > 30 columns), the Chairman payload is checked for four specific dropped columns, and a Member resolves to exactly one row.
- **Permissions (write)** — eleven checks on who may *change* a record: President + MA edits all seven groups, HS + FD edits exactly contact and finance, the other two levels edit nothing, no level below the top can write an access-granting field, only the top may add or erase, and derived fields and member IDs are refused outright. A wrong reading of `full` is a privilege-escalation path rather than a leak, so it would not have shown up in any column count.
- **Payload contents** — the probe member's real date of birth, mobile, personal email and removal reason are asserted absent from the Chairman's JSON; the age rings and growth tree are asserted present in the admin file and absent from the HS + FD one.
- **Posts and permission levels** — every post code in the data is in the catalogue, and for all 150 members the derived level is asserted equal to the highest post held. Four further checks pin the displayed level numbers to the internal ranks they invert, so the President cannot silently start reading as *Level 4*. 39 members are confirmed lifted above their class by a post.
- **Accounts** — one per member, unique usernames, a unique salt each, hashes only, and every removed or resigned member disabled. Account permission levels are asserted equal to the levels derived from the post record, so the login path and the payload path cannot drift.
- **Per-member payloads** — every Member-tier file is asserted to hold exactly its own record and no one else's.
- **PII** — every mobile matches the synthetic format and every personal email was regenerated.

```
$ python scripts/verify.py
...
All acceptance checks passed.
```

**Three values deliberately disagree with the spreadsheet, and the check allows exactly those three.** Three members chair one project and supervise another. The spec ranks Chairman above SO; the workbook's summary column records them as SO. The spec is the spec — and the workbook's own *"Chairman / SO Of (2026)"* column records both roles, so nothing is lost either way.

---

## Project structure

```
smart-member-management-platform/
├── data/
│   ├── JCI_Victoria_Member_Data.xlsx   source workbook (synthetic)
│   └── members.db                      generated, committed
├── src/                                all the logic
│   ├── db.py            get_frames() -> dict of DataFrames
│   ├── derived.py       derived fields + verification against the sheet
│   ├── health.py        health score, weights in one dict
│   ├── alerts.py        the seven rules
│   ├── roles.py         the post catalogue; highest post -> permission level
│   ├── auth.py          one account per member, PBKDF2 hashes
│   ├── growth.py        promotion ladder, referral tree, age rings
│   ├── permissions.py   the field-group matrix + page gates
│   └── mutations.py     the write half of that matrix: who may change what
├── scripts/
│   ├── load_data.py     Excel -> SQLite, regenerates contact PII
│   ├── export_json.py   SQLite -> per-tier payloads + accounts
│   ├── validate_upload.py  checks a submitted workbook before it is applied
│   ├── mutate.py        applies one write, re-checking the permission level
│   └── verify.py        62 acceptance checks
└── web/
    ├── app/
    │   ├── login/       sign-in page and its server actions
    │   └── (app)/       the signed-in shell: 8 pages, one session guard
    ├── components/      sidebar, account card, charts, rings, tree, tables,
    │                    in-place field editors, add/erase panels
    ├── lib/             theme tokens, server-only data + auth + admin,
    │                    posts.ts (post codes -> words), mutations.ts (writes)
    └── data/            generated payloads and accounts, committed
```

**Stack:** Python 3.11 / pandas 2.2 / SQLite for the logic; Next.js 16, React 19, Tailwind CSS 3.4 and Recharts for the interface. No API for member data, no runtime database, no ORM, and no auth library — sign-in is PBKDF2 and an HMAC-signed cookie, about 200 lines in `web/lib/auth.ts`. The Python runs at build time; the web app reads JSON in server components. The age rings are plain SVG with no client JavaScript at all.

> **One deliberate deviation from the spec.** The PRD specifies Streamlit (sections 6 and 13.3). The interface was built in Next.js instead, because the target design — a dense, branded dashboard — is not reachable in Streamlit without CSS overrides that hang off its internal class names. **None of the logic changed:** derived fields, the health score, the seven alert rules and the permission matrix are all still pandas, and still the thing `verify.py` checks. Only the rendering layer is different — and rendering in server components is what lets hidden fields be genuinely absent rather than merely undisplayed.

Architectural rules are documented in [`.cursorrules`](.cursorrules) — worth reading before contributing.

---

## Deploying

Vercel, from the `web/` directory. Import the repo, set the root directory to `web`, and deploy. **No environment variables and no database to provision**, because the payloads are committed files.

Any Node host works the same way:

```bash
cd web && npm install && npm run build && npm start
```

---

## Data & privacy

**No real member's personal data is in this repository.**

- The member names in `data/JCI_Victoria_Member_Data.xlsx` were already synthetic when the workbook was prepared for the hackathon.
- Mobile numbers and personal email addresses are **regenerated** by `scripts/load_data.py` using a fixed seed (`PII_SEED = 20260919`), so they are deterministic across runs but correspond to no one. `verify.py` asserts every mobile matches the synthetic `+852########` format and every personal email was regenerated.
- The CSV export carries a `# Synthetic demo data - not real member records` header line.
- Structure, volumes and distributions are realistic — that is what makes the alert rules meaningful — but the values are not.

If you fork this for a real chapter, treat `data/` and `web/data/` as containing live personal data and **remove them from version control** before pushing anywhere.

---

## Known limits

Stated rather than hidden.

**Attendance is a yearly count, not per-meeting records.** The system can tell you someone attended 3 of 6 meetings; it cannot show an attendance trend or detect someone who stopped coming three months ago. The fix is an `attendance(member_id, event_date, event_name, present)` table.

**The activity log lives in server memory for the length of a session.** It is append-only within the process and reachable only through the Activity page. The next stage writes it to the append-only `activity_log` table already defined in the schema, where it survives restarts and cannot be edited from the app.

**Editing writes to the local filesystem, so it needs a host with one.** An edit writes to SQLite and re-runs the same Python export that builds the demo, which is what keeps the permission boundary in step with the data. That needs Python and a writable disk, so the write paths work under `npm run dev` and on any ordinary Node host, and **not on Vercel**, whose filesystem is read-only — a deployment there stays the read-only demo the payloads already make it. Moving the writes to a hosted Postgres, with the export running as a job, is the next stage.

**Edits are one field at a time, and there is no undo.** A form that posts thirty columns cannot be checked against a permission matrix without unpicking which of them the level may actually write, and the version that silently drops the rest is the version that looks like it worked. The journey table records class and status changes, but a corrected phone number is only recoverable from the activity log, which does not survive a restart.

Email and WhatsApp are still not sent from here. Passwords are seeded from the member id and there is no reset flow, no rate limiting on sign-in and no second factor — all three are needed before this holds real contact details.

**The activity log lives in server memory** for the length of the process. The append-only `activity_log` table is already in the schema; moving the log into it is what makes it survive a restart and stop being editable from the app.

---

## Two open design questions

Both are decisions, not oversights, and both are worth confirming before any pilot.

**1. How much contact detail should a project Chairman see?** The spec grants project leaders full read access on contact, following current chapter practice. This build takes the narrower reading: JCI address in the clear, mobile and personal email masked. A Chairman gets a way to reach his team — not everyone's private number.

**2. `member_status` is visible to every role.** So a Chairman can see that a member is *"Pending BOD Motion"* even though the entire governance group is hidden from him. That follows the spec, where identity is full access for everyone. It is defensible — the status is operationally necessary — but it is a judgement call.

Two further questions need a chapter, not a codebase, to answer: **how long a removed member's record is kept**, and **who the named data owner is**. Both are governance decisions for the board, and neither is settled here.

---

## Documentation

- This README — the whole of it. How the logic works, how permissions are enforced, how posts resolve to permission levels, and where the build made a judgement call.
- [`.cursorrules`](.cursorrules) — architectural constraints for anyone changing the code.
- The source comments — each module opens with what it is for and why it is built the way it is. `src/roles.py`, `src/permissions.py` and `src/mutations.py` are the three worth reading first: the posts, what each level may read, and what each level may change.

Source comments carry `PRD 4.2`-style citations to the original specification. That document is not in this repository; the citations are left in place as provenance, and the [Glossary](#glossary) and the sections above cover everything they refer to.

---

## Glossary

| Term | Meaning |
|---|---|
| **JCI** | Junior Chamber International. |
| **LOM** | Local Organisation Member — a chapter. This one is JCI Victoria. |
| **PM / FM / SM** | Prospective Member (joined, not yet inducted) / Full Member (inducted) / Senior Member (automatic at 40). |
| **Induction** | The ceremony and date a PM becomes a Full Member. |
| **FM requirement** | Two OC teams within six months of joining — required for induction. |
| **OC** | Organising Committee — the working members of a project team. |
| **MFG** | The chapter's regular monthly gathering. |
| **Chairman / SO** | The member leading a project / the Board member supervising it. |
| **BOD motion** | The formal vote required to remove a member or accept a resignation. |
| **P / MAD / MAO / HS / FD** | President / Membership Affairs Director / Membership Affairs Officer / Honorary Secretary / Finance Director. |
| **One Year to Lead** | Every post lasts one year; the board turns over each January. |

**One year to lead.** Every post in a JCI chapter lasts a single calendar year, and the board turns over each January. That is the fact behind most of this build: a system whose access rules have to be re-typed by hand every January is a system that will be wrong by February.

---

## License

Not yet licensed. Until a license is added, all rights are reserved — please open an issue if you would like to use this.
