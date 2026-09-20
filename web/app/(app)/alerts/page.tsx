import Link from "next/link";

import { Card, Empty, PageHead, Restricted, SeverityChip } from "@/components/ui";
import { getPayload } from "@/lib/data";
import type { Alert } from "@/lib/data";

/** PRD 6.3: the seven rules, grouped by type, each naming the responsible post. */
const RULE_BLURB: Record<number, string> = {
  1: "Active PMs whose six-month deadline falls within 60 days and who have fewer than two OC teams.",
  2: "Active PMs whose deadline has passed with fewer than two OC teams. The system knew weeks ago.",
  3: "Requirement met, more than 14 days ago, still not inducted.",
  4: "Current-year subscription unpaid. Includes arrears left by departed members, for write-off or chase.",
  5: "Full Members turning 40 within twelve months — the transfer is predictable years ahead.",
  6: "Active Full Members attending four or fewer MFGs with no project role this year.",
  7: "Board motion tabled and still unresolved. Past 60 days it escalates.",
};

function daysLabel(a: Alert): string {
  if (a.days === null || a.days === undefined) return "—";
  switch (a.rule_no) {
    case 1:
      return `${a.days} days left`;
    case 2:
      return `${a.days} days over`;
    case 3:
      return `waiting ${a.days} days`;
    case 4:
      return a.days > 0 ? `${a.days} prior year(s)` : "first year";
    case 5:
      return `${Math.round(a.days / 30)} months`;
    case 6:
      return `${a.days} months quiet`;
    case 7:
      return `${a.days} days open`;
    default:
      return String(a.days);
  }
}

export default async function AlertsPage() {
  const payload = await getPayload();

  if (!payload.access.pages.alerts) {
    return (
      <>
        <PageHead title="Alerts" subtitle="Members who need action today" />
        <Restricted what="The alerts queue" />
      </>
    );
  }

  const grouped = payload.alerts.reduce<Record<number, Alert[]>>((acc, a) => {
    (acc[a.rule_no] ??= []).push(a);
    return acc;
  }, {});
  const ruleNos = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <>
      <PageHead
        title="Alerts"
        subtitle={`${payload.alerts.length} open across ${ruleNos.length} rules · each one names the post responsible`}
      />

      {payload.alerts.length === 0 ? (
        <Empty>No alerts are visible to your role.</Empty>
      ) : (
        <div className="space-y-5">
          {ruleNos.map((no) => {
            const rows = grouped[no];
            return (
              <Card
                key={no}
                title={`${rows[0].rule}`}
                subtitle={RULE_BLURB[no]}
                right={
                  <div className="flex items-center gap-2">
                    <span className="chip bg-surface-sunken text-ink-muted">
                      owner · {rows[0].owner_post}
                    </span>
                    <span className="chip bg-jci-blue/10 text-jci-navy tnum">
                      {rows.length}
                    </span>
                  </div>
                }
              >
                <table className="table-jci">
                  <thead>
                    <tr>
                      <th className="w-[26%]">Member</th>
                      <th>Detail</th>
                      <th className="w-[15%]">Timing</th>
                      <th className="w-[12%]">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={`${a.rule_no}-${a.member_id}`} className="group">
                        <td>
                          <Link
                            href={`/members/${a.member_id}`}
                            className="font-semibold text-ink hover:text-jci-navy hover:underline underline-offset-2"
                          >
                            {a.member_name}
                          </Link>
                          <div className="text-[11px] text-ink-faint tnum">{a.member_id}</div>
                        </td>
                        <td className="text-ink-muted">{a.detail}</td>
                        <td className="tnum text-ink-muted">{daysLabel(a)}</td>
                        <td>
                          <SeverityChip level={a.severity} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
