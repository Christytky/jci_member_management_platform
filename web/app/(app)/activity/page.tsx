import Link from "next/link";

import { Card, Empty, PageHead, Restricted } from "@/components/ui";
import { read } from "@/lib/activity";
import { levelShort } from "@/lib/posts";
import { getPayload } from "@/lib/data";
import { brand, status } from "@/lib/theme";

export const dynamic = "force-dynamic";

const ACTION_TONE: Record<string, { bg: string; color: string }> = {
  SIGN_IN: { bg: "#E8EEF8", color: brand.navy },
  SIGN_OUT: { bg: "#F2F6F9", color: "#5C6480" },
  // A refused sign-in is the one row here that is not a record of access
  // granted, so it is the one that has to be impossible to skim past.
  SIGN_IN_FAILED: { bg: "#FCE9EA", color: status.risk },
  VIEW_RESTRICTED: { bg: "#FCE9EA", color: status.risk },
  VIEW_MEMBER: { bg: "#F2F6F9", color: "#5C6480" },
  VIEW_GROWTH: { bg: "#F1ECF7", color: "#6E3FA3" },
  EXPORT: { bg: "#FDF0E2", color: status.watch },
  UPLOAD: { bg: "#FDF0E2", color: status.watch },
  VIEW_DASHBOARD: { bg: "#F2F6F9", color: "#5C6480" },
  // Writes. A record CHANGING is a louder fact than a record being read,
  // and the three that alter who may see what — a post change, a record
  // added, a record erased — carry the risk colour rather than the warn one.
  EDIT: { bg: "#FDF0E2", color: status.watch },
  EDIT_ACCESS: { bg: "#FCE9EA", color: status.risk },
  CREATE: { bg: "#E8EEF8", color: brand.navy },
  DELETE: { bg: "#FCE9EA", color: status.risk },
};

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Hong_Kong",
  });
}

export default async function ActivityPage() {
  const payload = await getPayload();

  // PRD 6.6: President and MA only.
  if (!payload.access.pages.activity) {
    return (
      <>
        <PageHead title="Activity log" subtitle="Who saw what, and when" />
        <Restricted what="The activity log" />
      </>
    );
  }

  const rows = read();
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = rows.filter((r) => r.ts.slice(0, 10) === today).length;

  return (
    <>
      <PageHead
        title="Activity log"
        subtitle="Append-only. Every sign-in, restricted view, export and upload."
        right={
          <div className="flex gap-2">
            <span className="chip bg-surface-sunken text-ink-muted tnum">
              {rows.length} entries
            </span>
            <span className="chip bg-jci-blue/10 text-jci-navy tnum">
              {todayCount} today
            </span>
          </div>
        }
      />

      <p className="mb-5 rounded-xl border border-jci-blue/20 bg-jci-blue/[0.07] px-4 py-3 text-[12.5px] leading-5 text-jci-navy">
        Everything below was written by someone using this app. Open a member record, then
        come back — the rows your own clicks created will be at the top, under your own
        name. Since logins became individual, the Actor column is a person rather than a
        persona somebody selected: that is the difference between an audit trail and a
        label.
      </p>

      <Card>
        {rows.length === 0 ? (
          <Empty>Nothing recorded yet. Open a member record to write the first row.</Empty>
        ) : (
          <table className="table-jci">
            <thead>
              <tr>
                <th className="w-[15%]">Time</th>
                <th className="w-[16%]">Actor</th>
                <th className="w-[16%]">Permission level</th>
                <th className="w-[14%]">Action</th>
                <th className="w-[11%]">Target</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = ACTION_TONE[r.action] ?? ACTION_TONE.VIEW_MEMBER;
                return (
                  <tr key={r.log_id}>
                    <td className="tnum text-[12px] text-ink-muted">{when(r.ts)}</td>
                    <td className="font-semibold">{r.actor_name}</td>
                    <td className="text-[12px] text-ink-muted" title={r.actor_role}>
                      {levelShort(r.actor_role)}
                    </td>
                    <td>
                      <span
                        className="chip"
                        style={{ background: tone.bg, color: tone.color }}
                      >
                        {r.action.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </td>
                    <td className="tnum text-[12px]">
                      {r.target_member_id ? (
                        <Link
                          href={`/members/${r.target_member_id}`}
                          className="text-jci-navy hover:underline underline-offset-2"
                        >
                          {r.target_member_id}
                        </Link>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="text-[12px] text-ink-muted">{r.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <p className="mt-4 text-[11.5px] leading-5 text-ink-faint">
        Stage 1 keeps the log in server memory for the length of the demo. Stage 2 writes it
        to the append-only <code className="tnum">activity_log</code> table already defined
        in the schema, where it survives restarts and cannot be edited from the app.
      </p>
    </>
  );
}
