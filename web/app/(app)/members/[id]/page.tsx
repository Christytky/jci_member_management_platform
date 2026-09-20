import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";

import { EditableCell, EditableField } from "@/components/EditableField";
import { PromotionLadder } from "@/components/PromotionLadder";
import { DeleteMemberPanel } from "@/components/RecordAdmin";
import {
  BandChip, Card, ClassChip, Empty, Masked, PageHead, PermissionChip, PostChip,
} from "@/components/ui";
import { record } from "@/lib/activity";
import { promotionHistory } from "@/lib/growth";
import { fieldSpec, getPayload } from "@/lib/data";
import type { Member, Payload, WritableField } from "@/lib/data";
import { parseRecord, postLabel } from "@/lib/posts";
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
    const exists = payload.access.tier === "Member";
    if (!exists) notFound();
    return (
      <>
        <PageHead title="Member record" />
        <Empty>
          Your permission level only opens your own record.{" "}
          <Link
            href={`/members/${payload.viewer.member_id}`}
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
    actor_name: payload.viewer.name,
    actor_role: payload.access.tier,
    action: restricted.length ? "VIEW_RESTRICTED" : "VIEW_MEMBER",
    target_member_id: member.member_id,
    field_group: restricted.join(", ") || null,
    detail: `Opened ${member.full_name}${
      restricted.length ? ` · ${restricted.join(", ")}` : ""
    }`,
  });

  const can = (g: string) => payload.access.visible_groups.includes(g);
  // The spec for a field this permission level may CHANGE, or null. Passed
  // to every field below; a null spec renders the plain read-only value, so
  // the editable and the read-only page are the same page.
  const spec = (f: string) => fieldSpec(payload, f);
  // The reference year, from the payload's pinned as-of date rather than the
  // clock — derived.py computes the fee status against the same date, so
  // reading the clock here would offer an editor on a row that is not the
  // one the status is derived from.
  const currentYear = Number(payload.as_of.slice(0, 4));

  /**
   * A field that becomes editable exactly when this permission level may
   * write it. spec() returns null otherwise, and EditableField then renders
   * the same read-only <dt>/<dd> pair Field does — so the page a Chairman
   * sees is the page it always was, with no disabled controls to explain.
   */
  const Edit = (props: {
    f: string;
    label: string;
    value?: string | null;
    mono?: boolean;
    span?: number;
    masked?: boolean;
    emptyText?: string;
  }) => (
    <EditableField
      label={props.label}
      value={props.value}
      memberId={member.member_id}
      spec={spec(props.f)}
      mono={props.mono}
      span={props.span}
      masked={props.masked}
      emptyText={props.emptyText}
    />
  );
  const events = payload.events
    .filter((e) => e.member_id === id)
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
  const fees = payload.fees
    .filter((f) => f.member_id === id)
    .sort((a, b) => b.fee_year - a.fee_year);
  const oc = payload.oc
    .filter((o) => o.member_id === id)
    .sort((a, b) => b.year - a.year);

  // The growth ladder, built from the same events the Journey card shows --
  // which reached this page already scoped to the viewer's tier.
  const history = await promotionHistory(id, payload.events);

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
          // In words. "2026 post: MAD" asked the reader to know the code;
          // "Membership Affairs Director" is the same fact, readable.
          member.board_post_2026
            ? `${postLabel(member.board_post_2026)} · 2026`
            : null,
          member.senior_designation ? postLabel(member.senior_designation) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        right={<HealthGauge member={member} visible={can("analytics")} />}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <ClassChip value={member.member_class} />
        {/* The post this member holds, then the permission level it earns.
            Two chips for two different facts -- what they ARE, and what they
            may SEE -- where there used to be one string mixing both. The
            headline is the highest post; the rest are in its tooltip. Both
            are skipped for a member holding no post, because the class chip
            beside them already says PM and there is no rank to report. */}
        <PostChip codes={parseRecord(member.roles ?? member.role_record)} />
        {member.permission_tier && parseRecord(member.roles).length > 1 && (
          <PermissionChip level={member.permission_tier} via={member.governing_role} />
        )}
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
              {/* member_id has no editor at any level: it is the key every
                  other table joins on, set once when the record is created. */}
              <Field label="Member ID" value={member.member_id} mono />
              <Edit f="member_class" label="Class" value={member.member_class} />
              <Edit f="date_joined" label="Joined" value={member.date_joined} mono />
              <Edit
                f="induction_date"
                label="Inducted"
                value={member.induction_date}
                emptyText="not yet"
                mono
              />
              <Edit f="member_status" label="Status" value={member.member_status} />

              {/* PRD 6.5: a hidden group renders as nothing at all, not as a
                  locked row -- the field is absent because the data is absent.
                  The lock glyph is reserved for MASKED values (PRD 13.4), which
                  is what HS + FD get: a real cell holding an age band. */}
              {can("personal") && (
                <>
                  <Edit f="date_of_birth" label="Date of birth" value={member.date_of_birth}
                    mono masked={isMasked(member.date_of_birth)} />
                  {/* Age is derived from the date of birth on every read, so
                      it has no editor at any level -- there is no column to
                      write. Correct the birth date and the age follows. */}
                  <Field label="Age" value={member.age ? String(member.age) : null}
                    masked={isMasked(member.age)} />
                </>
              )}

              {can("contact") && (
                <>
                  <Edit f="mobile" label="Mobile" value={member.mobile} mono
                    masked={isMasked(member.mobile)} />
                  <Edit f="jci_email" label="JCI email" value={member.jci_email} />
                  <Edit f="personal_email" label="Personal email" value={member.personal_email} />
                  {/* Derived from the class and status, not stored. */}
                  <Field label="WhatsApp groups" value={member.whatsapp_groups} />
                </>
              )}

              {can("professional") && (
                <>
                  <Edit f="company" label="Company" value={member.company} />
                  <Edit f="job_title" label="Job title" value={member.job_title} />
                  <Edit f="industry" label="Industry" value={member.industry} />
                  <Edit f="areas_of_interest" label="Interests" value={member.areas_of_interest} />
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
                <Edit f="bod_motion_date" label="Motion date" value={member.bod_motion_date} mono />
                <Edit f="bod_motion_result" label="Motion result" value={member.bod_motion_result} />
                <Edit f="status_reason" label="Status reason" value={member.status_reason} span={2} />
                <Edit f="remark" label="Remark" value={member.remark} span={2} />
              </dl>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card
            title="Promotion history"
            subtitle="Every step up, and how long it took"
            right={
              <span className="chip bg-surface-sunken text-ink-muted tnum">
                {history.promotions}
              </span>
            }
          >
            <PromotionLadder history={history} currentClass={member.member_class} />
          </Card>

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
                        <td>
                          {/* Editable on the current year only. The finance
                              group has no column on the member row -- the
                              status is derived from this table -- so this
                              cell is where an EDIT right on finance actually
                              lands, and it is the Finance Director's whole
                              job here: mark this year paid. Earlier years
                              are history rather than a correction. */}
                          <EditableCell
                            value={f.status}
                            memberId={member.member_id}
                            spec={f.fee_year === currentYear ? spec("fee_status_current") : null}
                            tone={
                              f.status === "Unpaid"
                                ? status.risk
                                : f.status === "Pending"
                                  ? status.watch
                                  : status.healthy
                            }
                          />
                        </td>
                        <td className="tnum text-ink-muted">
                          {f.fee_year === currentYear ? (
                            <EditableField
                              label="Fee submitted"
                              hideLabel
                              value={f.submission_date}
                              memberId={member.member_id}
                              spec={spec("fee_submission_date")}
                              mono
                            />
                          ) : (
                            (f.submission_date ?? "—")
                          )}
                        </td>
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

      {/* Erasing a record. Rendered only for the permission level that owns
          the member database, so for every other level it is not on the
          page at all. */}
      {payload.access.can_delete && (
        <DeleteMemberPanel
          memberId={member.member_id}
          name={member.full_name}
          status={member.member_status}
        />
      )}
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
