# Product Requirements Document
## Smart Member Growth Tracker — JCI Victoria

**Version** 1.0 · **Date** 19 September 2026 · **Owner** [your name] · **Build window** 24 hours
**Stack** Python 3.11 · Streamlit · SQLite · pandas · Plotly · deployed to Streamlit Community Cloud
**Team** 2–3 people, some coding ability, building in Cursor

---

## 1. Why this document exists

This PRD is written to be read by both your team and your AI coding tool. Section 4 (data model) and Section 6 (screens) are precise enough to paste into Cursor as context. Section 9 is the hour-by-hour plan. If you read nothing else, read Section 2, Section 8 and Section 9.

The single most important decision in this document: **we are building a judge-ready demo, not a working system.** Everything is read-only. No real login, no writes to the database, no emails sent. That decision buys us the time to make the parts a judge actually sees genuinely good.

---

## 2. Product summary

A membership platform that replaces the chapter's annual spreadsheet with one live member record, a full movement history, and access granted by post rather than by file sharing.

**The demo must land three points, in this order:**

1. **We can see the chapter's movement.** Who joined, who was inducted, who transferred to Senior, who left and why — over time, on one screen.
2. **We catch people before we lose them.** Alerts and a health score turn 150 rows into a short list of members who need action today.
3. **Everyone sees only what their post needs.** The same member record looks different to the President, the Finance Director, a project Chairman and an ordinary member — and every look is logged.

Point 3 is the differentiator. Most hackathon entries in a "member tracker" track will show a dashboard. Very few will answer "why would a chapter trust this with everyone's date of birth?" Build the role switcher early and rehearse that moment.

---

## 3. Users and roles

Five personas, matching the chapter's actual posts. The demo ships with one seeded persona per role.

| Persona | Post | What they come to the app to do |
|---|---|---|
| President | P | See chapter health at a glance; approve motions |
| MA team | MAD, MAO | Work the PM pipeline; act on alerts; run inductions |
| Secretary & Finance | HS, FD | Keep contact records correct; chase and record fees |
| Project leader | BOD member, Chairman, SO | Find and contact members for their team |
| Member | any | See and check their own record |

### 3.1 Field-level permission matrix

Fields are grouped, and access rules read from the group — never hardcoded per field. This is the table to implement literally.

| Field group | Fields | President + MA | HS + FD | Board / Chairman / SO | Member (own record) |
|---|---|---|---|---|---|
| Identity | member_id, name, class, status, date_joined, induction_date, years | Full | Full | Full | Full |
| Contact | mobile, personal_email, jci_email, whatsapp_groups | Full | **Full (edit)** | Full (read) | Full (edit) |
| Personal | date_of_birth, gender | Full | Masked (age band) | Hidden | Full |
| Professional | company, job_title, industry, areas_of_interest | Full | Read | Read | Full (edit) |
| Finance | fee status, submission date, fee history | Full | **Full (edit)** | Hidden | Own only |
| Governance | bod_motion_date, bod_motion_result, status_reason, remark | Full | Read | Hidden | Hidden |
| Analytics | health score, alerts, movement charts | Full | Finance alerts only | Hidden | Own score only |

Notes for the build:
- "Masked" renders a derived value, not the real one: `33` becomes `30–34`, `+85298942925` becomes `+8529•••2925`.
- Hidden fields are absent from the response, not hidden in CSS. A judge may ask; be able to say the data never reaches the browser.
- Project leaders see contact details for all active members, per the chapter's current practice of letting Chairmen reach anyone. Scoping this to their own team roster is a Stage 2 tightening option worth mentioning in the pitch as a design choice you considered.
- Members see their own record only, including their own health score.

---

## 4. Data model

Seven tables. Source data is the existing `JCI_Victoria_Member_Data.xlsx` (150 members, 443 status events, 409 fee records, 136 participation rows, 17 projects).

**Principle: stored fields are facts; everything else is computed.** Age, requirement deadlines, requirement status, project role, WhatsApp group and health score are never stored. This is what stops a spreadsheet going stale, and it is worth saying out loud in the pitch.

### 4.1 Schema (SQLite)

```sql
CREATE TABLE members (
  member_id TEXT PRIMARY KEY,          -- VJC-0001, never reused
  first_name TEXT, last_name TEXT, gender TEXT,
  date_of_birth DATE,
  mobile TEXT, personal_email TEXT, jci_email TEXT,
  member_class TEXT,                   -- PM | FM | SM
  member_status TEXT,                  -- Pending Fee | Active | Pending Induction
                                       -- | Pending BOD Motion | Removed | Resigned
  date_joined DATE, induction_date DATE,
  referred_by TEXT REFERENCES members(member_id),
  company TEXT, job_title TEXT, industry TEXT,
  areas_of_interest TEXT,              -- semicolon separated: CD;LD;MA
  senior_designation TEXT,             -- PP | PNP | HLP | Senator | SMCC
  board_post_2026 TEXT, is_bod_2026 TEXT, national_post_2026 TEXT,
  mfg_attended_2026 INTEGER,           -- see Known gap 4.4
  bod_motion_date DATE, bod_motion_result TEXT,
  status_reason TEXT, remark TEXT
);

CREATE TABLE status_events (           -- append-only; the audit trail
  event_id TEXT PRIMARY KEY,
  member_id TEXT REFERENCES members(member_id),
  event_date DATE, event_type TEXT,
  from_status TEXT, to_status TEXT, from_class TEXT, to_class TEXT,
  whatsapp_change TEXT, reason TEXT, recorded_by TEXT
);

CREATE TABLE fee_records (
  member_id TEXT REFERENCES members(member_id),
  fee_year INTEGER, class_that_year TEXT,
  status TEXT,                         -- Paid | Unpaid | Pending | Waived
  submission_date DATE, remark TEXT,
  PRIMARY KEY (member_id, fee_year)
);

CREATE TABLE oc_participation (
  member_id TEXT REFERENCES members(member_id),
  year INTEGER, project_name TEXT, project_type TEXT,
  project_role TEXT,                   -- Chairman | SO | OC
  date_joined_project DATE,
  counts_toward_fm TEXT                -- Y | N
);

CREATE TABLE projects (
  project_name TEXT PRIMARY KEY, project_type TEXT,
  chairman_id TEXT, so_id TEXT, oc_count INTEGER, team_size INTEGER
);

CREATE TABLE activity_log (            -- append-only
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TIMESTAMP, actor_name TEXT, actor_role TEXT,
  action TEXT,                         -- VIEW_RESTRICTED | EXPORT | SWITCH_ROLE | VIEW_MEMBER
  target_member_id TEXT, field_group TEXT, detail TEXT
);

CREATE TABLE demo_personas (           -- replaces auth in Stage 1
  persona_key TEXT PRIMARY KEY, display_name TEXT,
  role TEXT, member_id TEXT
);
```

### 4.2 Derived fields (computed in pandas, never stored)

| Field | Rule |
|---|---|
| `age` | Years between `date_of_birth` and today |
| `senior_transfer_year` | Year the member turns 40. Blank for existing SM |
| `fm_deadline` | `date_joined + 183 days`. PM only |
| `fm_teams_counted` | Count of `oc_participation` rows where `counts_toward_fm = 'Y'` |
| `fm_status` | ≥2 teams → Completed; 1 → In Progress (1/2); 0 and inside window → Not Started; window elapsed and <2 → **Overdue** |
| `project_role_2026` | Most senior 2026 role: Chairman > SO > OC > none |
| `whatsapp_groups` | Rule, never typed: class + status, plus all three groups if `is_bod_2026 = 'Y'` |
| `fee_status_current` | `fee_records` row for the current year |
| `lapse_count` | Count of `fee_records` rows with status Unpaid |
| `months_since_last_event` | Today minus max `event_date` for that member |

### 4.3 Health score

Applies to **PM and FM only**. Senior Members show "N/A — not project eligible", which is itself a good detail to mention when a judge asks whether you thought about fairness.

```
score = 100 * (0.30*fee + 0.25*attendance + 0.20*role + 0.15*recency + 0.10*compliance)
```

| Component | Value |
|---|---|
| `fee` | Current year Paid or Waived = 1.0; Pending = 0.6; Unpaid = 0.0. Subtract 0.15 per prior unpaid year, floor 0 |
| `attendance` | `min(mfg_attended_2026 / 6, 1.0)` |
| `role` | Chairman or SO = 1.0; OC = 0.7; none = 0.0 |
| `recency` | ≤3 months = 1.0; ≤6 = 0.8; ≤12 = 0.5; ≤24 = 0.25; >24 = 0.0 |
| `compliance` | Requirement Completed or not applicable = 1.0; In Progress = 0.5; Overdue = 0.0; Pending BOD Motion = 0.0 |

Bands: **Green ≥70 · Amber 40–69 · Red <40.** Weights live in one `WEIGHTS` dict at the top of the module so you can say, truthfully, that they are configurable per chapter.

### 4.4 Known gap to disclose honestly

`mfg_attended_2026` is a single count, not per-meeting attendance records. The system therefore cannot show an attendance trend or detect someone who stopped coming three months ago. Stage 2 adds an `attendance(member_id, event_date, event_name, present)` table. Say this in the technical notes rather than hiding it — judges respond well to a team that knows its own data limits.

---

## 5. Scope

### In scope for the 24-hour build
Seeded SQLite database from the Excel file · role switcher · dashboard · member directory · member detail with field masking · alerts page · health score · activity log · role-gated CSV export · deployed public URL.

### Explicitly out of scope
Real authentication · any write to member data · sending email or WhatsApp · member self-service editing · interest matching engine · multi-chapter tenancy · mobile app · file uploads.

Write the out-of-scope list on a slide. "We deliberately did not build X in 24 hours, here is when it lands" reads as judgement. Silence on it reads as an oversight.

---

## 6. Screens

Six pages in a Streamlit multipage app. Every page reads the current persona from `st.session_state.persona` and filters fields through one shared `apply_permissions(df, role)` function. **One permission function, called by every page** — this is both good engineering and the thing that makes the demo credible.

### 6.1 Global: role switcher
A sidebar `st.selectbox` listing the five personas, always visible, showing the active persona's name and post. Switching writes a `SWITCH_ROLE` row to `activity_log` and reruns. Also render a one-line banner: "You are viewing as Wai Yee Ng — Chairman. Some fields are hidden by your access level."

### 6.2 Dashboard
Top row, five KPI tiles: Active members · Active PMs · PMs overdue · Unpaid 2026 fees · Members at risk (Red band).

Middle: **movement chart** — a stacked bar by year of joins, inductions, senior transfers and departures, built from `status_events`. This is the "we can finally see the chapter's flow" moment; give it the most screen space.

Below: PM funnel (Not Started → In Progress → Completed → Pending Induction → Inducted) as a horizontal bar, and a Departure reasons breakdown from `status_reason`.

Right column: "Needs attention today" — the top five Red-band members with a one-line reason each.

Visible to President and MA in full; HS/FD see the finance tiles only; project leaders and members do not see this page at all.

### 6.3 Alerts
A table of every triggered rule, grouped by type, each row naming the member, the trigger, days overdue or remaining, and the responsible post. Sortable, filterable by type. Clicking a row opens the member detail.

Implement these seven rules:

| # | Rule | Condition | Owner |
|---|---|---|---|
| 1 | Requirement due soon | Active PM, `fm_deadline` within 60 days, teams < 2 | MAO |
| 2 | Requirement overdue | Active PM, `fm_deadline` passed, teams < 2 | MAD |
| 3 | Ready for induction | teams ≥ 2, no `induction_date`, completed >14 days ago | HS |
| 4 | Fee unpaid | current year Unpaid, past due date | FD |
| 5 | Senior transfer due | FM turning 40 within 12 months | HS |
| 6 | Disengaged member | Active FM, `mfg_attended_2026` ≤ 4 and no project role | MAD |
| 7 | Motion pending | `bod_motion_result = 'Pending'` for >60 days | HS |

**Verified counts on the seeded data: 4, 10, 6, 23, 5, 7 and 8.** These thresholds were tuned against the real distribution — a 30-day window on rule 1 fires only twice, and `mfg ≤ 1` on rule 6 fires zero times because every low-attendance Full Member happens to hold a project role. Re-check the counts after loading; a judge who opens an empty alerts page has stopped listening.

### 6.4 Member directory
Searchable, filterable table (class, status, health band, interest area). Columns shown depend on role — a project leader's view has no fee column at all. Row click opens detail.

### 6.5 Member detail
Header: name, ID, class, status, health score gauge with band colour.
Tabs: **Profile** (identity, contact, professional) · **Journey** (timeline of `status_events`) · **Fees** (year-by-year history) · **Projects** (participation rows).

Masked fields render with a small lock icon and the masked value. Hidden groups render as an entire absent tab — a project leader does not see a Fees tab at all.

Viewing a Restricted field group writes a `VIEW_RESTRICTED` row to `activity_log`. Make this real, because the next page proves it.

### 6.6 Activity log
Reverse-chronological table: time, actor, role, action, target, field group. Filterable by actor and action.

**This page is the punchline of the demo.** After switching roles and opening two member records, open this page and show the judge the rows those exact actions just created. Nothing else you build will make the privacy claim as concrete.

Visible to President and MA only.

### 6.7 Export
A button, visible only to President, MA and FD, that produces a CSV of the columns the current role may see, with a header row recording who exported it and when. Writes an `EXPORT` row to the log. Mention in the pitch that the export carries a watermark and is logged, which is the answer to "people download the sheet and forward it".

---

## 7. Non-functional requirements

Response under one second on 150 rows — trivial at this size, so load the whole database into pandas once and cache with `@st.cache_data`. The app must run from a clean clone with `pip install -r requirements.txt && streamlit run app.py`. All demo data is synthetic: **do not deploy real members' dates of birth or phone numbers to a public URL.** Regenerate names and contact details before pushing, and say on the slide that the demo runs on synthetic data — it reinforces the privacy story rather than weakening it.

---

## 8. Roadmap

### Stage 1 — Hackathon demo (24 hours)
Everything in Section 6, read-only, on seeded synthetic data, deployed publicly.
**Done when:** a stranger can open the URL, switch roles and see the difference without you narrating.

### Stage 2 — Chapter pilot (4–8 weeks after the hackathon)
Real authentication by email magic link, mapped to `member_id`. Write operations with an approval queue: the MA team edits directly, members submit changes for approval. Email and WhatsApp delivery of alerts. An import tool that maps a chapter's own sheet to the schema. The `attendance` table from 4.4. Data retention policy for removed members, and a log that cannot be edited from the app.
**Done when:** the MA team runs one full month without touching the spreadsheet.

### Stage 3 — Adoption and scale (6–12 months)
Direct member self-service editing with verification. The interest and background matching engine: given a project's needs, suggest members by registered interest, industry and availability. Volunteer and service opportunity matching. Multi-chapter tenancy with an aggregate NOM dashboard over anonymised metrics. Automated handover pack at year end. WhatsApp group automation driven by the derived group rule.
**Done when:** a second chapter runs on it without your team's help.

### Why self-service editing is Stage 2, not Stage 1
Two reasons worth stating if asked. Your existing records have not been verified yet, so opening edits immediately means 150 members correcting data nobody has confirmed — cleaning once and then opening is less total work. And self-editing touches the exact fields the alerts depend on, so an approval step in the first cycle protects the data the whole system runs on.

---

## 9. The 24-hour build plan

Three workstreams. With three people, run A, B and C in parallel. With two, one person takes A+B and the other takes C plus testing.

**A — Data and logic** (the strongest coder) · **B — UI and screens** · **C — Pitch, deck, video, and testing**

| Hours | A: Data & logic | B: UI | C: Pitch |
|---|---|---|---|
| 0–2 | Repo, venv, `requirements.txt`, Excel → SQLite loader | Streamlit skeleton, 6 empty pages, sidebar switcher | Storyboard the 4-minute demo; draft deck outline |
| 2–5 | Derived-field module, verify against the Excel | Dashboard layout with dummy numbers | Write problem and solution slides |
| 5–8 | Health score + the 7 alert rules, with unit checks | Wire dashboard to real data; movement chart | Record the "before" shot: the spreadsheet itself |
| 8–11 | `apply_permissions()` + masking helpers | Member directory and detail tabs | Deck: roadmap and architecture slides |
| 11–13 | Activity log writes on every restricted view | Alerts page | **Checkpoint: is the role switcher working?** |
| 13–15 | CSV export with watermark | Activity log page; role-aware navigation | Rehearse demo end to end, note every rough edge |
| 15–17 | Fix whatever C found | Visual polish: colours, spacing, empty states | Re-record demo walkthrough |
| 17–19 | Deploy to Streamlit Cloud, smoke test the public URL | Mobile-width check, loading states | Record final pitch video |
| 19–21 | Buffer for deployment problems | Buffer | Edit video, finish deck |
| 21–23 | Freeze code. README and repo tidy | Freeze | Submit the form; paste URLs |
| 23–24 | Rehearse the live demo twice | Rehearse | Rehearse |

**Hard rule: code freeze at hour 21.** The most common way a hackathon team loses is a broken deploy at hour 23 from a change nobody needed.

### Checkpoints
- **Hour 8:** the database loads and derived fields match the spreadsheet. If not, cut the movement chart.
- **Hour 13:** the role switcher visibly changes what is on screen. If not, drop everything else until it does — it is the demo.
- **Hour 17:** the app runs on a public URL. If not, stop feature work and deploy.

### Cut list, in the order to cut
1. Departure-reasons breakdown on the dashboard
2. CSV export (keep the button, disabled, and talk about it)
3. Member directory filters (keep search)
4. PM funnel chart (a table works)
5. Activity log page — **cut last**; without it the privacy claim is just an assertion

---

## 10. Demo script (4 minutes)

1. **0:00–0:20 — The problem, shown not told.** The real spreadsheet on screen. "This is how 150 members are managed. Every January it changes hands."
2. **0:20–1:00 — Dashboard.** "Here is the same chapter. This chart is every join, induction, senior transfer and departure since 1965. We have never been able to see this before."
3. **1:00–1:45 — Alerts.** "Ten prospective members are past their deadline right now. The system knew three weeks ago." Click into one.
4. **1:45–2:15 — Member detail.** Health score, journey timeline. "One record, full history, nothing overwritten."
5. **2:15–3:05 — The role switch.** Same member, switch to Chairman. Date of birth gone, fees gone, motion history gone, contact details still there. "A Chairman gets what he needs to run his team. Nothing more."
6. **3:05–3:30 — Activity log.** "Every one of those views was recorded. This is what a spreadsheet can never do."
7. **3:30–4:00 — Roadmap.** What is next, and what a chapter needs to adopt it.

Rehearse step 5 until it takes twenty seconds and no words are wasted. It is the moment that wins or loses the pitch.

---

## 11. Acceptance criteria

- [ ] `streamlit run app.py` works from a clean clone
- [ ] All 150 members load; derived fields match the spreadsheet on a 10-row spot check
- [ ] All 7 alert rules fire with non-zero counts on seed data
- [ ] Health scores computed for PM and FM; SM shows N/A
- [ ] Switching persona changes visible fields on the member detail page
- [ ] Hidden fields are absent from the data passed to the page, not merely styled out
- [ ] Every restricted view, role switch and export appears in the activity log within one second
- [ ] CSV export contains only the columns the current role may see
- [ ] Public URL loads for someone not on the team
- [ ] No real member's date of birth, mobile or personal email is in the deployed data

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Deployment fails late | Deploy a hello-world to Streamlit Cloud in hour 1, not hour 17 |
| Permission logic scattered across pages | One `apply_permissions()` module, imported everywhere. Enforce in review |
| Dashboard looks empty on real data | Verify alert counts at hour 8; adjust thresholds, not the data |
| Team burns hours on styling | Styling is workstream B only, and only after hour 15 |
| Real personal data pushed public | Regenerate names and contacts in the loader; add a check to the acceptance list |
| Scope creep toward a real system | Section 5's out-of-scope list is a contract, not a suggestion |

---

## 13. Design system — JCI brand

The app must look like JCI, not like a default Streamlit app. This is cheap to do and judges notice it immediately.

### 13.1 Official brand colours

From the JCI Brand Guidelines 2026. Use these for **interface chrome**: headers, buttons, navigation, the role banner, links.

| Token | Name | Hex |
|---|---|---|
| `--jci-blue` | JCI Blue (primary) | `#0097D7` |
| `--jci-black` | JCI Black (text) | `#130F2D` |
| `--jci-white` | JCI White | `#FFFFFF` |
| `--jci-navy` | JCI Navy | `#1F4789` |
| `--jci-teal` | JCI Teal | `#57BCBC` |
| `--jci-yellow` | JCI Yellow | `#EFC40F` |

**Typeface: Plus Jakarta Sans** (JCI's official primary). Free on Google Fonts, so load it with one line. Fallback: system sans.

Get the new JCI logo from the official branding resources at jci.cc rather than lifting it from a web page, and keep its clear space. As a JCI chapter you are entitled to use it; a stretched or recoloured logo is worse than no logo.

### 13.2 Chart colours — do not use the brand hexes raw

**This matters and is easy to get wrong.** The brand palette was designed for print and interface, not for data. Used directly as chart series it fails on three counts: JCI Navy is too dark and JCI Yellow too light for a shared lightness band, JCI Teal is too low in chroma to read as a colour at all, and blue-against-teal is indistinguishable to a colour-blind viewer.

So the chart palette is **derived from the same JCI hues, stepped to pass**. These values were run through a colour-vision validator and pass lightness band, chroma floor, colour-blind separation and normal-vision separation across all pairs. Use them exactly.

**Categorical — the movement chart's four series:**

| Series | Hex | Derived from |
|---|---|---|
| Joined as PM | `#1590CA` | JCI Blue |
| Inducted | `#D2AE1C` | JCI Yellow |
| Transferred to Senior | `#0551C1` | JCI Navy |
| Departed | `#D33B36` | — |

**Status — health bands and alert severity.** These are reserved: never reuse them as a chart series.

| State | Hex | Use |
|---|---|---|
| Healthy (Green ≥70) | `#149676` | health band, resolved alerts |
| Watch (Amber 40–69) | `#EF8619` | health band, warnings |
| At risk (Red <40) | `#B71824` | health band, overdue alerts |

Three rules that come with these:

- **Never colour alone.** Every health band and alert carries a text label and an icon as well as its colour. A judge may be colour-blind; one in twelve men is.
- **Always label the chart.** The gold and teal steps sit below 3:1 contrast against a white surface, which is fine for a filled bar but means every series needs a visible legend and direct labels, not colour alone.
- **Light mode only.** Dark mode is a separate design pass, not a colour flip. Out of scope for 24 hours — say so if asked.

### 13.3 Streamlit theming

Create `.streamlit/config.toml` before writing any page:

```toml
[theme]
primaryColor = "#0097D7"
backgroundColor = "#FFFFFF"
secondaryBackgroundColor = "#F2F6F9"
textColor = "#130F2D"
font = "sans serif"
```

Then inject the typeface once in `app.py`:

```python
st.markdown("""<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap');
html, body, [class*="css"] { font-family: 'Plus Jakarta Sans', sans-serif; }
</style>""", unsafe_allow_html=True)
```

### 13.4 Component rules

**KPI tiles** — big number in JCI Black, label above in muted grey, a 3px JCI Blue rule on the left edge. No icons, no drop shadows.

**Role banner** — a full-width strip under the header in JCI Blue at 10% opacity: "Viewing as Wai Yee Ng · Chairman — some fields are hidden by your access level." It must be visible in every screenshot you take.

**Masked fields** — render the masked value in muted grey with a small lock glyph and a tooltip reading "Hidden by your access level". Never an empty cell; an empty cell looks like missing data, a lock looks like a policy.

**Tables** — no zebra striping, a single hairline rule between rows, right-align numbers, and health band shown as a coloured chip with its text label.

**Empty states** — every table gets one. "No alerts of this type" beats a blank panel, and blank panels are what make a demo look broken.

---

## 14. Demo personas

Seed exactly these five. Pick the member IDs from the loaded data and fix them in `demo_personas` so the demo is identical every run.

| Key | Display name | Role | Seeded from |
|---|---|---|---|
| `president` | [name] | President + MA | the member whose `board_post_2026 = 'P'` |
| `ma` | [name] | President + MA | `board_post_2026 = 'MAD'` |
| `finance` | [name] | HS + FD | `board_post_2026 = 'FD'` |
| `chairman` | [name] | Board / Chairman / SO | any 2026 project Chairman |
| `member` | [name] | Member | any Active FM with no post |

Demo in the order president → chairman → member. The drop from full record to locked fields to own-record-only is the story, and it only lands if the order is descending.

---

## 15. Repo structure and module contracts

Agree this before anyone writes code, or two people will write the same function differently.

```
jci-member-tracker/
├── app.py                  # entry: theme, sidebar persona switcher, routing
├── .streamlit/config.toml
├── requirements.txt
├── data/
│   ├── JCI_Victoria_Member_Data.xlsx
│   └── members.db          # generated; commit it so the demo always runs
├── src/
│   ├── load_data.py        # Excel -> SQLite, with synthetic PII
│   ├── db.py               # get_frames() -> dict of DataFrames, cached
│   ├── derived.py          # all PRD 4.2 rules
│   ├── health.py           # PRD 4.3
│   ├── alerts.py           # PRD 6.3, seven rules
│   ├── permissions.py      # PRD 3.1 matrix
│   ├── logging_.py         # writes to activity_log
│   └── theme.py            # colour constants from PRD 13
└── pages/
    ├── 1_Dashboard.py  2_Alerts.py  3_Directory.py
    ├── 4_Member.py     5_Activity_Log.py
```

**Module contracts — fix these signatures now:**

```python
db.get_frames() -> dict[str, pd.DataFrame]   # keys: members, events, fees, oc, projects
derived.enrich(frames) -> pd.DataFrame       # members + every PRD 4.2 column
health.score(enriched) -> pd.DataFrame       # + health_score, health_band
alerts.build(enriched, frames) -> pd.DataFrame
    # columns: member_id, member_name, rule, detail, days, owner_post, severity
permissions.apply(df, role) -> pd.DataFrame  # drops hidden groups, masks personal
permissions.can_see(role, field_group) -> bool
logging_.record(actor, role, action, target_member_id=None, field_group=None)
```

Every page calls `permissions.apply()` before rendering. No exceptions — a single page that forgets it makes the whole privacy claim false, and a judge who clicks the wrong thing will find it.

---

## 16. Project setup files

**`requirements.txt`** — pin these, do not let the AI improvise versions:

```
streamlit==1.39.0
pandas==2.2.3
openpyxl==3.1.5
plotly==5.24.1
Faker==30.8.1
```

**`.cursorrules`** — put this at the repo root before your first prompt. It is the single highest-leverage thing you can do for vibe coding:

```
This is a Streamlit + SQLite membership dashboard for a JCI chapter.
Read PRD_Smart_Member_Growth_Tracker.md before any change; it is the spec.

Rules:
- Python 3.11, Streamlit multipage, pandas. No web framework, no ORM, no auth library.
- The app is READ-ONLY on member data. Never write to members, fees, events or oc tables.
  The only table written at runtime is activity_log.
- Every page must call permissions.apply(df, role) before rendering anything.
  Hidden field groups are DROPPED from the dataframe, never hidden with CSS.
- Derived fields (age, deadlines, requirement status, project role, health score)
  are computed in derived.py or health.py. Never store them in the database.
- Colours come from src/theme.py only. Never write a hex literal in a page.
- Keep functions under 40 lines. No class hierarchies. No premature abstraction.
- Do not add features that are not in the PRD. If the PRD is silent, ask.
```

---

## 17. Starting prompts for Cursor

Feed these in order, checking output after each. Attach this PRD as context.

1. "Read PRD sections 4.1 and 4.2. Write `load_data.py`: read `JCI_Victoria_Member_Data.xlsx`, create the SQLite schema exactly as specified, load all seven tables, and replace names, mobiles and personal emails with synthetic values using Faker. Print row counts per table."
2. "Write `derived.py` implementing every rule in PRD 4.2 as pandas functions over the loaded frames. Include a `verify()` that compares the computed values against the original spreadsheet columns and prints mismatches."
3. "Write `health.py` implementing PRD 4.3 with the weights in a module-level dict. Return score and band per member; N/A for SM."
4. "Write `alerts.py` implementing the seven rules in PRD 6.3, returning one dataframe with columns member_id, member_name, rule, detail, days, owner_post. Print the count per rule."
5. "Write `permissions.py` implementing the PRD 3.1 matrix: `apply_permissions(df, role)` drops hidden groups, masks personal fields, and returns the filtered frame. Include `mask_dob()` and `mask_mobile()`."
6. "Build the Streamlit app per PRD sections 6 and 13 (design system): sidebar persona switcher in `app.py`, and the six pages. Every page must call `apply_permissions` before rendering. Log restricted views to `activity_log`."
7. "Polish per PRD 13.4: KPI tiles, the movement stacked bar chart in Plotly using exactly the four hex values in PRD 13.2, health score gauge with the status colours, role banner, lock glyphs on masked fields, and an empty state for every table."

---

## 18. Open questions

1. Should project leaders see all members' contact details, or only their own team's? Current spec follows chapter practice (all members). Worth a decision before Stage 2.
2. How long are removed members' records kept? Needed for the Stage 2 data policy.
3. Who is the named data owner for the pilot — Honorary Secretary or Membership Affairs Director?
4. Is attendance recorded anywhere per meeting today, or only as a yearly count?
