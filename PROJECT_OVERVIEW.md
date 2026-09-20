# Project Overview — Smart Member Management Platform
### Briefing for teammates who are new to JCI

**Read this before the PRD.** The PRD tells you what to build. This tells you what the words mean and why the problem exists. Fifteen minutes here will save you hours of confusion later.

---

## 1. What JCI is

JCI (Junior Chamber International) is a global non-profit network of young leaders aged 18 to 40. It was founded in 1915, has around 150,000 members today, and is organised in three layers:

**JCI World** sets global direction. **National Organisations (NOM)** run each country — ours is JCI Hong Kong. **Local Organisations (LOM)** are the individual chapters where members actually belong. **JCI Victoria is our chapter**, and it is what this product is built for.

Members run community projects, business and entrepreneurship programmes, leadership training and international exchanges. The organisation's stated long-term goal, Vision 2040, is to grow to 500,000 members. It has not been above its 1981 peak since, which is why retention — not just recruitment — is the real problem.

### The one structural fact that explains everything

**"One Year to Lead."** Every leadership post in JCI lasts exactly one year. The President, the Secretary, every Director — all of them change every January. This is deliberate: it gives many members the chance to lead.

It also means **every system, every file and every piece of institutional knowledge changes hands once a year.** That is the root cause of the problem we are solving. A spreadsheet maintained lovingly by this year's Membership Affairs Director is a spreadsheet that next year's Director has never seen.

---

## 2. The member journey

This is the core domain model. The whole product is built around it.

```
   Prospective Member (PM)  →  Full Member (FM)  →  Senior Member (SM)
        joins, pays fee          inducted            automatically at 40
        must join 2 OC teams
        within 6 months
```

**Prospective Member (PM).** A new joiner. They pay their first subscription and have **six months** to serve on **two organising committees**. Meeting that requirement is what qualifies them for induction.

**Full Member (FM).** Inducted. Can hold posts, chair projects, vote. This is the working core of the chapter.

**Senior Member (SM).** At **age 40** a member transfers to Senior Member automatically. It is age-driven, not a choice, and it is predictable years in advance — which is exactly why the system can forecast it.

**Leaving.** A member can also be removed (usually non-payment, or failing the PM requirement) or resign. Either way it requires a **Board of Directors motion**: the member stays Active until the board formally approves. This is why the data has a "Pending BOD Motion" state.

---

## 3. How the chapter runs projects

Two kinds of activity, both organised the same way:

**MFG** — the chapter's regular monthly gathering. Each month's MFG has its own small team. **Flagship projects** — larger annual efforts, this year "AI Future Leaders" and "Youth Business Challenge".

Every project team has the same three roles: a **Chairman** who leads it, a **Supervising Officer (SO)** drawn from the Board who oversees it, and **OC members** (Organising Committee) who do the work. Serving as an OC member is what counts toward a PM's two-team requirement — being a Chairman or SO does not count, because by then you are already a Full Member.

---

## 4. Who's who — the posts that matter for this product

The chapter has around twenty posts. Only these five groups matter for what we are building:

**President (P)** — leads the chapter for the year, needs the whole picture.

**Membership Affairs team (MAD, MAO)** — the Director and Officer responsible for recruiting, tracking and inducting members. **They are our primary user.** The pain we are solving is theirs.

**Honorary Secretary (HS) and Finance Director (FD)** — HS keeps the records and minutes, FD handles subscriptions. Between them they maintain contact details and fee status.

**Board of Directors and project leaders** — the Board plus each project's Chairman and SO. They need to reach members to run their teams, and nothing more.

**Ordinary members** — everyone else. They should see their own record.

There are also permanent honorifics (Past President, Senator and so on) and national-level posts. These are titles, not access rights, and the product deliberately treats them that way.

---

## 5. How it works today, and why it breaks

Today the entire membership is a single Excel file. The Membership Affairs team maintains it. When someone else needs data, the file — or a copy of part of it — is sent to them.

**Four things go wrong:**

**Knowledge dies at handover.** Every January the file changes hands. Context, reasoning and half-finished follow-ups do not transfer with it.

**There is no history.** Status changes are made by overwriting a cell. Nobody can reconstruct why a member left in 2024, or when a PM actually completed their requirement.

**Tracking is manual.** Somebody has to notice that a PM's six-month deadline is approaching. In our real data, **ten of sixteen active PMs are already past their deadline** and nobody acted.

**Privacy cannot be controlled.** The file holds dates of birth, mobile numbers, employers, fee status and the reasons members were removed. A spreadsheet can only be shared whole. A project Chairman who needs three phone numbers receives everyone's personal data, can forward it to anyone, and no record exists of who saw what.

---

## 6. What we are building

A web platform that replaces the shared file with **one live member record, a full history, and access granted by post rather than by sending a file.**

Three things it does:

**Shows the chapter's movement.** Every join, induction, senior transfer and departure as a dated event with a reason, charted over time. The chapter has never been able to see this.

**Catches people before they are lost.** Automated alerts on deadlines, unpaid fees, upcoming fortieth birthdays and disengagement, plus a 0–100 health score that reduces 150 rows to a short watch list.

**Shows each person only what their post needs.** The same member record looks different to the President, the Finance Director, a Chairman and an ordinary member — and every look is written to an activity log.

That third point is the differentiator. Most entries in a "member tracker" hackathon track will show a dashboard. Almost none will have an answer to "why should a chapter trust you with everyone's date of birth?"

---

## 7. The dataset you will be working with

A realistic chapter dataset modelled on JCI Victoria's real sheet, with personal details synthesised:

| | |
|---|---|
| Members | 150 — 69 Full, 50 Senior, 31 Prospective |
| Currently active | 125 |
| Lifecycle events | 443, back to 1965 |
| Fee records | 409, covering 2024–2026 |
| Project participation rows | 136 across 17 projects |
| Active PMs past their deadline | 10 |
| Unpaid 2026 subscriptions | 23 |
| Members turning 40 within a year | 5 |

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **JCI** | Junior Chamber International |
| **LOM** | Local Organisation Member — a chapter. Ours is JCI Victoria |
| **NOM** | National Organisation Member — ours is JCI Hong Kong |
| **PM** | Prospective Member — joined, not yet inducted |
| **FM** | Full Member — inducted |
| **SM** | Senior Member — automatic at age 40 |
| **One Year to Lead** | Every post lasts one year; the board turns over each January |
| **Induction** | The ceremony and date a PM becomes a Full Member |
| **FM requirement** | Two OC teams within six months of joining, required for induction |
| **MFG** | The chapter's regular monthly gathering |
| **Flagship project** | A major annual project, larger than an MFG |
| **OC** | Organising Committee — the working members of a project team |
| **Chairman** | The member leading a project |
| **SO** | Supervising Officer — a Board member overseeing a project |
| **BOD** | Board of Directors |
| **BOD motion** | The formal vote required to remove or accept the resignation of a member |
| **P / VP / IPP** | President / Vice President / Immediate Past President |
| **HS / FD** | Honorary Secretary / Finance Director |
| **MAD / MAO** | Membership Affairs Director / Officer — our primary users |
| **PP / Senator / HLP** | Permanent honorifics, not current posts |
| **Vision 2040** | JCI's goal of reaching 500,000 members by 2040 |
| **Action Framework** | JCI's method: Analyze, Develop, Execute, Review |

---

## 9. What you need to know to start

You do not need to understand JCI's governance in detail. You need three things:

1. **The journey** — PM to FM to SM, with a six-month two-team requirement in the middle and an automatic exit at 40.
2. **The five roles** — President, Membership Affairs, Secretary/Finance, project leaders, ordinary members — and that each sees a different slice of the same record.
3. **Why the handover matters** — it is the reason this cannot just be a better spreadsheet.

Everything else is in the PRD. Start at section 2, then section 9 for the build plan.
