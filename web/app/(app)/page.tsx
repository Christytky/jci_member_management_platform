import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AgeRings } from "@/components/AgeRings";
import { MovementChart } from "@/components/MovementChart";
import { Card, Empty, Kpi, PageHead, Restricted } from "@/components/ui";
import { getPayload } from "@/lib/data";
import { series, status } from "@/lib/theme";

export default async function DashboardPage() {
  const payload = await getPayload();

  // PRD 6.2: project leaders and members do not see this page at all.
  if (!payload.access.pages.dashboard || !payload.dashboard) {
    return (
      <>
        <PageHead
          title="Dashboard"
          subtitle="Chapter health at a glance"
        />
        <Restricted what="The chapter dashboard" />
        <div className="mt-4 text-[13px] text-ink-muted">
          Your role can still open the{" "}
          <Link href="/directory" className="font-semibold text-jci-navy underline underline-offset-2">
            member directory
          </Link>{" "}
          and your own record.
        </div>
      </>
    );
  }

  const d = payload.dashboard;
  const k = d.kpis;
  const financeOnly = payload.access.tier === "HS + FD";

  return (
    <>
      <PageHead
        title={`Good morning, ${payload.viewer.name.split(" ")[0]}`}
        subtitle={`JCI Victoria · ${k.total_members} members on record · as at ${payload.as_of}`}
      />

      {/* PRD 6.2 top row: five KPI tiles. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Active members" value={k.active_members} note={`of ${k.total_members} on record`} />
        <Kpi label="Active PMs" value={k.active_pms} note="in the induction pipeline" />
        <Kpi
          label="PMs overdue"
          value={k.pms_overdue}
          note="past the six-month deadline"
          tone="risk"
        />
        <Kpi label="Unpaid 2026 fees" value={k.unpaid_fees} note="subscriptions outstanding" tone="warn" />
        <Kpi
          label="Members at risk"
          value={financeOnly ? "—" : k.at_risk}
          note={financeOnly ? "health score hidden" : "health score below 40"}
          tone={financeOnly ? "default" : "risk"}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card
            title="Chapter movement"
            subtitle="Every join, induction, senior transfer and departure since 1965"
            right={
              <span className="text-[11px] font-medium text-ink-faint">
                showing 2005 onward
              </span>
            }
          >
            <MovementChart data={d.movement} />
          </Card>

          {/* The age rings ship only in the President + MA payload: an average
              age is still an age, and HS + FD hold masked access to the
              personal group. An absent key, not a hidden panel. */}
          {d.age_rings && (
            <Card
              title="Age against the senior ceiling"
              subtitle="Average age of Full and Provisional Members — the ring closes at 40"
              right={
                <span className="text-[11px] font-medium text-ink-faint">active members</span>
              }
            >
              <AgeRings rings={d.age_rings} />
            </Card>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Induction pipeline" subtitle="Where prospective members stand">
              <ul className="space-y-2.5">
                {d.funnel.map((f) => {
                  const max = Math.max(...d.funnel.map((x) => x.count), 1);
                  return (
                    <li key={f.stage}>
                      <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                        <span className="text-ink-muted">{f.stage}</span>
                        <span className="font-semibold tnum">{f.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(f.count / max) * 100}%`,
                            background: series.joined,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card title="Why members left" subtitle="Recorded reason on departure">
              {d.departures.length === 0 ? (
                <Empty>No departures recorded.</Empty>
              ) : (
                <ul className="space-y-2.5">
                  {d.departures.map((r) => (
                    <li key={r.reason} className="flex items-baseline gap-3 text-[12.5px]">
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: series.departed }}
                        aria-hidden
                      />
                      <span className="flex-1 text-ink-muted">{r.reason}</span>
                      <span className="font-semibold tnum">{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        {/* PRD 6.2 right column: the five worst, each with a one-line reason. */}
        <Card
          title="Needs attention today"
          subtitle={financeOnly ? "Hidden by your access level" : "Lowest health scores"}
          className="self-start"
        >
          {financeOnly ? (
            <Empty>
              Health analytics are not part of your access level. Fee alerts are on the{" "}
              <Link href="/alerts" className="font-semibold text-jci-navy underline underline-offset-2">
                Alerts
              </Link>{" "}
              page.
            </Empty>
          ) : d.needs_attention.length === 0 ? (
            <Empty>Nobody is in the at-risk band. Unusual — check the data loaded.</Empty>
          ) : (
            <ul className="-my-1 divide-y divide-surface-rule/70">
              {d.needs_attention.map((m) => (
                <li key={m.member_id}>
                  <Link
                    href={`/members/${m.member_id}`}
                    className="group flex items-start gap-3 py-3 transition-colors hover:bg-surface-sunken/60"
                  >
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold tnum"
                      style={{ background: "#FCE9EA", color: status.risk }}
                    >
                      {m.score}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">
                        {m.name}
                      </span>
                      <span className="block text-[11.5px] leading-4 text-ink-faint">
                        {m.reasons.join(" · ") || "No specific driver recorded"}
                      </span>
                    </span>
                    <ArrowRight
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
