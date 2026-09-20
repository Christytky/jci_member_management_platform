# Smart Member Management Platform

**A membership system for a JCI chapter that replaces the shared spreadsheet — one live member record, a complete movement history, and access granted by post instead of by emailing a file.**

Built for the JCI Innovation Hackathon, using mock data as the working case.

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

| Signed in as | Role record | Access tier | Columns | Members | Alerts |
|---|---|---|---:|---:|---:|
| Xavier Tam | `P & BOD & FM` | President + MA | **58** | 150 | 63 |
| Adrian Shum | `MAO & FM` | President + MA | **58** | 150 | 63 |
| Mavis Tsang | `HS & BOD & SO & FM` | HS + FD | **51** | 150 | 42 |
| Oscar Szeto | `Chairman & FM` | Board / Chairman / SO | **30** | 150 | 0 |
| Ka Chun Siu | `FM` | Member | **54** | **1** (own record) | 0 |

A Member on the bottom row sees more columns than a Chairman above them, and that is correct: they see everything about *themselves* and nothing about anyone else. The file they are served contains one row.

Two guardrails keep it honest:

- `web/lib/data.ts` imports `server-only`, so the build **fails** if a client component ever imports payload access.
- `scripts/verify.py` reads the real values for a probe member out of SQLite and asserts those exact strings do not appear anywhere in the Chairman's JSON file.
- A Member's payload is not a filtered view of everyone — it is `web/data/members/<their id>.json`, a file that never contained anyone else. A bug in the request path cannot widen it.

---

## Roles are not permissions

A member's **role record** lists every post they hold: `MAD & BOD & SO & FM`. Their **access tier** is one of four, and it is derived — **the highest role held wins**.

```
role record   MAD & BOD & SO & FM
                │     │    │    └── FM   -> Member                (rank 1)
                │     │    └─────── SO   -> Board / Chairman / SO (rank 2)
                │     └──────────── BOD  -> Board / Chairman / SO (rank 2)
                └────────────────── MAD  -> President + MA        (rank 4)  ← wins
access tier   President + MA
```

So a record reading `FM & MA` is an **MA** on this system, not a Full Member — the tier is the highest of the roles held, never the first one listed and never the membership class. 39 of the 150 members hold a post that lifts them above their class; each one is a case where reading the first role, or the class, would have been wrong.

Everything follows from that single derivation:

- [`src/roles.py`](src/roles.py) holds the catalogue — one row per post a member can hold, each pinned to exactly one tier. It is the only place a post grants access; there is no second list that could disagree with it.
- Adding a post to a member's record changes their access at their next page load. Nothing else is edited, and no administrator types a permission anywhere.
- An unrecognised post code falls back to the Member tier — fails safe — and `verify.py` and the upload checker both name it rather than letting a new board post go unnoticed for a year.

The sign-in screen and the banner show both halves side by side, always: `P & BOD & FM → President + MA via P`. The derivation is the explanation.

---

## Individual logins

Every member has an account. It carries a `member_id` and **no permissions of its own** — the tier is re-read from the role record on every request, so a promotion takes effect immediately and a revoked post narrows access immediately, with no cookie to reissue.

- Username is the member's JCI Victoria address; passwords are stored as PBKDF2-HMAC-SHA256 (120,000 rounds) with a per-account salt.
- Sign-in failures are undifferentiated — a wrong password, an unknown address and a disabled account return the same message, so the form cannot be used to enumerate who is in the chapter.
- Removed and resigned members keep their record but cannot sign in. 140 of 150 accounts are enabled.
- The session cookie is HMAC-signed, `HttpOnly`, and holds a username and an expiry — never a permission. A tampered, swapped or expired cookie lands on `/login`.

This is what the old "viewing as" dropdown could never do. It could demonstrate the access model but not enforce it, and the activity log could only ever record *which persona was selected* — not who selected it. The Actor column now names a person.

Set `JCI_SESSION_SECRET` in production; the app refuses to issue a session without it.

---

## Who can write

**Only the President and the MA team** — the `President + MA` tier — can upload and replace the member database, at `/upload`. Not a flag on an account: an MAO whose record reads `MAO & FM` reaches that page, and a Vice President whose record reads `BOD & VP & FM` does not.

Uploading is two steps, never one. A submitted workbook is **staged and checked** — sheet by sheet, row counts, missing columns, duplicate member IDs, unrecognised class or status values, and role codes the catalogue does not know — and nothing on disk changes. A second, separate action **applies** it: loads the workbook, recomputes every derived field, re-derives every tier, and rebuilds every payload. That last step is not optional, because the payloads *are* the permission boundary; a database that has moved on from them is one whose access rules are stale.

The server action re-checks the tier itself rather than trusting that a form was rendered — a server action is a POST endpoint, and a page not drawing a button is not an access control.

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
python scripts/verify.py         # 47 acceptance checks, exits 1 on failure

# 2. Run the app
cd web
npm install
npm run dev                      # http://localhost:3000
```

`data/members.db` and `web/data/*.json` are committed, **so you can skip step 1 entirely** and go straight to `npm install`. Re-run the Python only when the source workbook or the logic changes.

### Signing in

The app opens on `/login`. Expand **Demonstration logins** for seeded accounts across all four tiers — click one to fill the form:

| Account | Role record | Tier | Password |
|---|---|---|---|
| `xaviertam@vjc.org.hk` | `P & BOD & FM` | President + MA | `Victoria@0036` |
| `mavistsang@vjc.org.hk` | `HS & BOD & SO & FM` | HS + FD | `Victoria@0011` |
| `oscar.szeto@vjc.org.hk` | `Chairman & FM` | Board / Chairman / SO | `Victoria@0003` |
| `kachun.siu@vjc.org.hk` | `FM` | Member | `Victoria@0001` |

Every account follows `Victoria@<last four of member id>`. The panel is synthetic-data-only — set `JCI_DEMO_ACCOUNTS=0` and rebuild the payloads to ship an empty list.

### Exploring the four tiers

Open a member record as **Xavier Tam**, then sign in as **Oscar Szeto** and open the same record: date of birth, fee status, motion history and health score are gone from the page — and from the payload behind it. Then sign in as the President and open the **Activity log** to see the rows those sign-ins and clicks just created, each under a person's name.

Each tier also has a different navigation: Chairman and Member have no Dashboard and no Alerts page, only President + MA can open the Activity log, the Growth tree and the member-database upload, and the age rings are absent from the HS + FD dashboard entirely — an average age is still an age, and that tier holds masked access to the personal group.

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

| Field group | President + MA | HS + FD | Board / Chairman / SO | Member |
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

Pages are gated the same way, on the tier rather than on the account:

| Page | President + MA | HS + FD | Board / Chairman / SO | Member |
|---|:--:|:--:|:--:|:--:|
| Dashboard | ● | ● | — | — |
| Alerts | ● | ● | — | — |
| Directory | ● | ● | ● | own record |
| Member record | ● | ● | ● | own record |
| Growth tree | ● | — | — | — |
| Activity log | ● | — | — | — |
| Export | ● | ● | — | — |
| **Member database (write)** | ● | — | — | — |

The circular age diagram follows the field group rather than the page: it ships only to a tier holding **unmasked** access to `personal`, so it is absent from the HS + FD dashboard file, not hidden on their screen.

---

## Verification

`scripts/verify.py` runs 47 acceptance checks and exits non-zero on any failure:

- **Row counts** — 150 members, 443 status events, 409 fee records, 136 OC participations, 17 projects.
- **Derived fields vs. the source spreadsheet** — every derived column the workbook also holds is compared across all 150 rows, not spot-checked.
- **Alert counts** — all seven rules are asserted against their expected values (4, 10, 6, 23, 5, 7, 8). A rule that silently stops firing fails the build.
- **Health score** — every PM and FM scored, every SM `N/A`, all scores within 0–100.
- **Permissions** — access provably narrows with tier (58 > 51 > 30 columns), the Chairman payload is checked for four specific dropped columns, and a Member resolves to exactly one row.
- **Payload contents** — the probe member's real date of birth, mobile, personal email and removal reason are asserted absent from the Chairman's JSON; the age rings and growth tree are asserted present in the admin file and absent from the HS + FD one.
- **Roles and tiers** — every role code in the data is in the catalogue, and for all 150 members the derived tier is asserted equal to the highest role held. 39 members are confirmed lifted above their class by a post.
- **Accounts** — one per member, unique usernames, a unique salt each, hashes only, and every removed or resigned member disabled. Account tiers are asserted equal to the tiers derived from the role record, so the login path and the payload path cannot drift.
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
│   ├── roles.py         the role catalogue; highest role -> access tier
│   ├── auth.py          one account per member, PBKDF2 hashes
│   ├── growth.py        promotion ladder, referral tree, age rings
│   └── permissions.py   the field-group matrix + page gates
├── scripts/
│   ├── load_data.py     Excel -> SQLite, regenerates contact PII
│   ├── export_json.py   SQLite -> per-tier payloads + accounts
│   ├── validate_upload.py  checks a submitted workbook before it is applied
│   └── verify.py        47 acceptance checks
└── web/
    ├── app/
    │   ├── login/       sign-in page and its server actions
    │   └── (app)/       the signed-in shell: 8 pages, one session guard
    ├── components/      sidebar, account card, charts, rings, tree, tables
    ├── lib/             theme tokens, server-only data + auth + admin
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

**Writes are limited to replacing the whole member database.** There is no per-field editing in the app: the President and MA team upload a workbook and it replaces the records. Email and WhatsApp are still not sent from here. Passwords are seeded from the member id and there is no reset flow, no rate limiting on sign-in and no second factor — all three are needed before this holds real contact details.

**The activity log lives in server memory** for the length of the process. The append-only `activity_log` table is already in the schema; moving the log into it is what makes it survive a restart and stop being editable from the app.

---

## Documentation

- This README — the whole of it. How the logic works, how permissions are enforced, how roles resolve to tiers, and where the build made a judgement call.
- [`.cursorrules`](.cursorrules) — architectural constraints for anyone changing the code.
- The source comments — each module opens with what it is for and why it is built the way it is. `src/roles.py`, `src/permissions.py` and `src/growth.py` are the three worth reading first.

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
