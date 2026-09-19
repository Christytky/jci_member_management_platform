import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";

import { BandChip, Card, ClassChip, Empty, Masked, PageHead } from "@/components/ui";
import { record } from "@/lib/activity";
import { getPayload } from "@/lib/data";
import type { Member, Payload } from "@/lib/data";
import { healthBand, status } from "@/lib/theme";

/**
 * PRD 6.5. The page the demo turns on.
 *
 * Tabs whose field group is hidden from this role are not rendered at all
 * -- a project leader does not see a greyed-out Fees tab, he sees a record
 * with no Fees tab, because the fee data is not in his payload.
 */
export default async function MemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payload = await getPayload();
  const member = payload.members.find((m) => m.member_id === id);

  if (!member) {
    // Either the ID does not exist, or this role may not see that record.
    const exists = payload.persona.role === "Member";
    if (!exists) notFound();
    return (
      <>
        <PageHead title="Member record" />
        <Empty>
          Your role can only open your own record.{" "}
          <Link
            href={`/members/${payload.persona.member_id}`}
            className="font-semibold text-jci-navy underline underline-offset-2"
          >
            Open it
          </Link>
          .
        </Empty>
      </>
    );
  }

  // PRD 6.5: viewing a restricted field group writes to the activity log.
  // Made real here, because the Activity page proves it a moment later.
  const restricted = payload.access.visible_groups.filter((g) =>
    ["personal", "finance", "governance"].includes(g)
  );
  record({
    actor_name: payload.persona.name,
    actor_role: payload.persona.role,
    action: restricted.length ? "VIEW_RESTRICTED" : "VIEW_MEMBER",
    target_member_id: member.member_id,
    field_group: restricted.join(", ") || null,
    detail: `Opened ${member.full_name}${
      restricted.length ? ` · ${restricted.join(", ")}` : ""
    }`,
  });

  const can = (g: string) => payload.access.visible_groups.includes(g);
  const events = payload.events
    .filter((e) => e.member_id === id)
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
  const fees = payload.fees
    .filter((f) => f.member_id === id)
    .sort((a, b) => b.fee_year - a.fee_year);
  const oc = payload.oc
    .filter((o) => o.member_id === id)
    .sort((a, b) => b.year - a.year);

  return (
    <>
      <div className="mb-1 text-[12px] text-ink-faint">
        <Link href="/directory" className="hover:text-jci-navy hover:underline">
          Directory
        </Link>
        <span className="px-1.5">/</span>
        <span className="tnum">{member.member_id}</span>
      </div>

      <PageHead
        title={member.full_name}
        subtitle={[
          member.member_status,
          member.board_post_2026 ? `2026 post: ${member.board_post_2026}` : null,
          member.senior_designation,
        ]
          .filter(Boolean)
          .join(" · ")}
        right={<HealthGauge member={member} visible={can("analytics")} />}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <ClassChip value={member.member_class} />
        {member.years_membership !== null && (
          <span className="chip bg-surface-sunken text-ink-muted tnum">
            {member.years_membership} year{member.years_membership === 1 ? "" : "s"} a member
          </span>
        )}
        {member.is_bod_2026 === "Y" && (
          <span className="chip bg-jci-navy/10 text-jci-navy">Board of Directors 2026</span>
        )}
        {can("analytics") && member.project_role_2026 !== "None" && (
          <span className="chip bg-jci-blue/10 text-jci-navy">
            {member.project_role_2026} · 2026
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Profile">
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5">
              <Field label="Member ID" value={member.member_id} mono />
              <Field label="Class" value={member.member_class} />
              <Field label="Joined" value={member.date_joined} mono />
              <Field label="Inducted" value={member.induction_date ?? "not yet"} mono />

              {/* PRD 6.5: a hidden group renders as nothing at all, not as a
                  locked row -- the field is absent because the data is absent.
                  The lock glyph is reserved for MASKED values (PRD 13.4), which
                  is what HS + FD get: a real cell holding an age band. */}
              {can("personal") && (
                <>
                  <Field label="Date of birth" value={member.date_of_birth} mono
                    masked={isMasked(member.date_of_birth)} />
                  <Field label="Age" value={member.age ? String(member.age) : null}
                    masked={isMasked(member.age)} />
                </>
              )}

              {can("contact") && (
                <>
                  <Field label="Mobile" value={member.mobile} mono masked={isMasked(member.mobile)} />
                  <Field label="JCI email" value={member.jci_email} />
                  <Field label="Personal email" value={member.personal_email} />
                  <Field label="WhatsApp groups" value={member.whatsapp_groups} />
                </>
              )}

              {can("professional") && (
                <>
                  <Field label="Company" value={member.company} />
                  <Field label="Job title" value={member.job_title} />
                  <Field label="Industry" value={member.industry} />
                  <Field label="Interests" value={member.areas_of_interest} />
                </>
              )}

              {member.senior_transfer_year && (
                <Field
                  label="Transfers to Senior"
                  value={String(member.senior_transfer_year)}
                  mono
                />
              )}
            </dl>
          </Card>

          {can("governance") ? (
            <Card title="Governance" subtitle="Board motions and recorded reasons">
              <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                <Field label="Motion date" value={member.bod_motion_date} mono />
                <Field label="Motion result" value={member.bod_motion_result} />
                <Field label="Status reason" value={member.status_reason} span={2} />
                <Field label="Remark" value={member.remark} span={2} />
              </dl>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card
            title="Journey"
            subtitle="Append-only. Nothing is overwritten."
            right={<span className="chip bg-surface-sunken text-ink-muted tnum">{events.length}</span>}
          >
            {events.length === 0 ? (
              <Empty>No lifecycle events recorded.</Empty>
            ) : (
              <ol className="relative space-y-3.5 border-l border-surface-rule pl-4">
                {events.map((e) => (
                  <li key={e.event_id} className="relative">
                    <span
                      className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-2 ring-white"
                      style={{ background: status.healthy }}
                      aria-hidden
                    />
                    <div className="text-[12.5px] font-semibold">{e.event_type}</div>
                    <div className="text-[11.5px] text-ink-faint tnum">
                      {e.event_date}
                      {e.recorded_by ? ` · recorded by ${e.recorded_by}` : ""}
                    </div>
                    {e.reason && (
                      <div className="mt-0.5 text-[11.5px] text-ink-muted">{e.reason}</div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {can("finance") ? (
            <Card title="Fees" subtitle="Year by year">
              {fees.length === 0 ? (
                <Empty>No fee records.</Empty>
              ) : (
                <table className="table-jci">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Class</th>
                      <th>Status</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((f) => (
                      <tr key={f.fee_year}>
                        <td className="font-semibold tnum">{f.fee_year}</td>
                        <td className="text-ink-muted">{f.class_that_year}</td>
                        <td
                          className="font-semibold"
                          style={{
                            color:
                              f.status === "Unpaid"
                                ? status.risk
                                : f.status === "Pending"
                                  ? status.watch
                                  : status.healthy,
                          }}
                        >
                          {f.status}
                        </td>
                        <td className="tnum text-ink-muted">{f.submission_date ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          ) : null}

          <Card title="Projects" subtitle="Organising committee participation">
            {oc.length === 0 ? (
              <Empty>No project participation recorded.</Empty>
            ) : (
              <table className="table-jci">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Project</th>
                    <th>Role</th>
                    <th>Counts</th>
                  </tr>
                </thead>
                <tbody>
                  {oc.map((o, i) => (
                    <tr key={`${o.project_name}-${i}`}>
                      <td className="tnum font-semibold">{o.year}</td>
                      <td className="text-ink-muted">{o.project_name}</td>
                      <td className="text-ink-muted">{o.project_role}</td>
                      <td className="text-ink-muted">
                        {o.counts_toward_fm === "Y" ? "toward FM" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      <HiddenNote payload={payload} />
    </>
  );
}

/** A masked value arrives already derived from the server ("born 1990-1994",
 *  "30-34", "+8529...2925") -- never the real one, so there is nothing to
 *  reveal client-side. */
function isMasked(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.startsWith("born ") || /^\d+-\d+$/.test(value) || value.includes("•");
}

function Field({
  label,
  value,
  mono,
  span,
  masked,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  span?: number;
  masked?: boolean;
}) {
  return (
    <div className={span === 2 ? "col-span-2" : undefined}>
      <dt className="label">{label}</dt>
      <dd className={`mt-0.5 text-[13px] ${mono ? "tnum" : ""} ${value ? "" : "text-ink-faint"}`}>
        {masked && value ? <Masked value={value} /> : value || "—"}
      </dd>
    </div>
  );
}

function HealthGauge({ member, visible }: { member: Member; visible: boolean }) {
  if (!visible) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-surface-rule bg-surface px-4 py-3 text-[12px] text-ink-faint">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        Health score hidden
      </div>
    );
  }
  const score = member.health_score;
  if (score === null || score === undefined) {
    return (
      <div className="rounded-xl border border-surface-rule bg-surface px-4 py-3 text-right">
        <div className="label">Health</div>
        <div className="mt-0.5 text-[12px] text-ink-faint">N/A — not project eligible</div>
      </div>
    );
  }
  const b = healthBand[(member.health_band as keyof typeof healthBand) ?? "N/A"];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-rule bg-surface px-4 py-3">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl text-[17px] font-bold tnum"
        style={{ background: b.bg, color: b.color }}
      >
        {score}
      </div>
      <div>
        <div className="label">Health score</div>
        <div className="mt-0.5">
          <BandChip band={member.health_band ?? "N/A"} />
        </div>
      </div>
    </div>
  );
}

function HiddenNote({ payload }: { payload: Payload }) {
  if (payload.access.hidden_groups.length === 0) return null;
  return (
    <p className="mt-5 flex items-start gap-2 rounded-xl bg-surface px-4 py-3 text-[12px] leading-5 text-ink-muted">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
      <span>
        {payload.access.hidden_groups.length} field group
        {payload.access.hidden_groups.length === 1 ? "" : "s"} (
        {payload.access.hidden_groups.join(", ")}) were dropped before this page was
        rendered. They are not hidden with styling — open developer tools and they are not
        in the response.
      </span>
    </p>
  );
}
