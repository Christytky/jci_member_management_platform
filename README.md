# JCI Victoria — Smart Member Growth Tracker

One live member record, a full movement history, and access granted by post
rather than by sending a file.

Built for the JCI Innovation Hackathon. Read `PROJECT_OVERVIEW.md` first if
you are new to JCI, then `PRD_Smart_Member_Growth_Tracker.md` for the spec.

---

## Stack, and why it is not Streamlit

The PRD specifies Streamlit. It was changed to Next.js because the target
design (a dense, branded dashboard) is not reachable in Streamlit without
CSS hacks that hang off Streamlit's internal class names and break between
versions — a bad thing to discover at hour 19 of 24.

The Python was kept. All the logic that matters — derived fields, health
score, the seven alert rules, the permission matrix — is still pandas, and
it is still the thing that gets verified. What changed is only what renders
it.

```
Excel ──▶ SQLite ──▶ pandas logic ──▶ 5 pre-filtered JSON payloads ──▶ Next.js
         (schema)   (derived/health/     (one per demo persona)      (server
                     alerts/permissions)                              components)
```

There is no API, no database at runtime and no second deployment. The
Python runs at build time; the web app reads JSON in server components.

**Why that preserves the privacy claim.** PRD 11 requires that hidden
fields be absent from the data passed to the page, not styled out. Each
persona's JSON is filtered through `permissions.apply()` before it is
written, and Next.js server components render it on the server. A field
hidden from a role is absent from that role's file, absent from the server
render, and absent from the browser. Open developer tools in front of a
judge and it is not there. `scripts/verify.py` asserts this on every run.

---

## Running it

Two commands, from a clean clone.

```bash
# 1. Build the data (Python 3.11+)
pip install -r requirements.txt
python scripts/load_data.py      # Excel  -> data/members.db
python scripts/export_json.py    # SQLite -> web/data/payload.*.json
python scripts/verify.py         # 30 acceptance checks, exits 1 on failure

# 2. Run the app (Node 20+)
cd web
npm install
npm run dev                      # http://localhost:3000
```

`data/members.db` and `web/data/*.json` are committed, so the app runs
without the Python step. Re-run the Python only when the source workbook or
the logic changes.

---

## Deploying

Vercel, from the `web/` directory. Import the repo, set the root directory
to `web`, and deploy — no environment variables and no database to
provision, because the payloads are committed files.

Do this in **hour 1**, not hour 17. A hello-world deploy that already works
turns a late deployment problem into a five-minute fix.

---

## Repo layout

```
jci-member-tracker/
├── data/
│   ├── JCI_Victoria_Member_Data.xlsx   source workbook
│   └── members.db                      generated, committed
├── src/                                the logic worth reviewing
│   ├── db.py            get_frames() -> dict of DataFrames
│   ├── derived.py       every PRD 4.2 rule + verify() against the sheet
│   ├── health.py        PRD 4.3, weights in one WEIGHTS dict
│   ├── alerts.py        PRD 6.3, the seven rules
│   └── permissions.py   PRD 3.1, the field-group matrix
├── scripts/
│   ├── load_data.py     Excel -> SQLite, regenerates PII
│   ├── export_json.py   SQLite -> per-persona payloads
│   └── verify.py        acceptance checks (PRD 11)
└── web/
    ├── app/             6 pages + the CSV route
    ├── components/      Sidebar, RoleSwitcher, RoleBanner, charts, ui
    ├── lib/             theme (PRD 13), data (server-only), activity log
    └── data/            generated payloads, committed
```

---

## The demo (PRD 10)

Four minutes. Order matters: **president → chairman → member**, descending,
because the drop is the story.

1. The spreadsheet on screen. "This is how 150 members are managed."
2. Dashboard — the movement chart. "Every join, induction, senior transfer
   and departure since 1965. We have never seen this."
3. Alerts — 10 PMs past their deadline right now. Click into one.
4. Member detail — health score, journey timeline.
5. **Switch to Chairman on the same record.** Date of birth gone, fees
   gone, motion history gone, contact masked. Twenty seconds, no wasted
   words.
6. Activity log — the rows those clicks just created.
7. Roadmap.

Rehearse step 5 until it is twenty seconds. It wins or loses the pitch.

---

## Three things to know before a judge asks

**The seven alert counts are verified, not asserted.** `scripts/verify.py`
checks them against the PRD's numbers (4, 10, 6, 23, 5, 7, 8) on every run.

**Three derived values deliberately disagree with the spreadsheet.** Three
members chair one project and supervise another; PRD 4.2 ranks Chairman
above SO and the sheet's summary column does not. The PRD is the spec. The
sheet's own "Chairman / SO Of (2026)" column records both, so nothing is
lost.

**Two age bases exist on purpose.** PRD 4.2 defines age as years since
birth, which is what the app displays. The chapter's sheet uses calendar
year age, which is the basis senior transfer actually runs on — you
transfer in the year you turn 40, not on your birthday. Forecasting uses
the calendar basis so the transfer year matches what the chapter expects.

---

## Known limits, stated rather than hidden

**Attendance is a yearly count, not per-meeting records.** So the system
cannot show an attendance trend or detect someone who stopped coming three
months ago. Stage 2 adds an `attendance(member_id, event_date, event_name,
present)` table. (PRD 4.4)

**The activity log lives in server memory for the length of the demo.**
Stage 2 writes it to the append-only `activity_log` table already defined
in the schema, where it survives restarts and cannot be edited from the
app.

**Everything is read-only.** No authentication, no writes to member data,
no email or WhatsApp sent. That was a deliberate scope decision (PRD 5) and
it is what bought the time to make the parts a judge sees genuinely work.

**The demo runs on synthetic data.** Mobiles and personal emails are
regenerated deterministically by `load_data.py`; names in the source
workbook were already synthetic. No real member's contact details are in
the deployed build.

---

## Two open design questions

Both are worth raising in the pitch as decisions you made rather than
details you missed.

1. **How much contact detail should a project Chairman see?** PRD 3.1
   grants project leaders full read on contact, following current chapter
   practice. This build takes the narrower reading: the JCI address in the
   clear, mobile and personal email masked. A Chairman gets a way to reach
   his team, not everyone's private number.

2. **`member_status` is visible to every role**, so a Chairman can see that
   a member is "Pending BOD Motion" even though the governance group is
   hidden from him. That follows PRD 3.1, where identity is full access for
   everyone, but it is a judgement call worth confirming before the pilot.
