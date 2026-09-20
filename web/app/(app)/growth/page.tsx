import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { GrowthTree } from "@/components/GrowthTree";
import { Card, ClassChip, Empty, Kpi, PageHead, Restricted } from "@/components/ui";
import { record } from "@/lib/activity";
import { getPayload } from "@/lib/data";
import { parseRecord, summarisePosts } from "@/lib/posts";

export const metadata = { title: "Growth tree — JCI Victoria" };

/**
 * PRD 6.2 companion: the chapter's growth, drawn as lineage rather than as
 * a count per year.
 *
 * President + MA only, and not as a policy preference -- this page reads
 * every member's referral line and class history at once, which is the
 * definition of a chapter-wide view. The tree is not in any other tier's
 * payload file, so a tier that reaches this URL is served the notice below
 * with nothing behind it.
 */
export default async function GrowthPage() {
  const payload = await getPayload();

  if (!payload.access.pages.growth || !payload.dashboard?.growth_tree) {
    return (
      <>
        <PageHead title="Growth tree" subtitle="Where this chapter's members came from" />
        <Restricted what="The chapter growth tree" />
        <div className="mt-4 text-[13px] text-ink-muted">
          Your own promotion history is on{" "}
          <Link
            href={`/members/${payload.viewer.member_id}`}
            className="font-semibold text-jci-navy underline underline-offset-2"
          >
            your record
          </Link>
          .
        </div>
      </>
    );
  }

  const tree = payload.dashboard.growth_tree;
  const s = tree.stats;

  record({
    actor_name: payload.viewer.name,
    actor_role: payload.access.tier,
    action: "VIEW_GROWTH",
    field_group: "identity",
    detail: `Opened the chapter growth tree · ${s.total} members, ${s.recruiters} recruiters`,
  });

  return (
    <>
      <PageHead
        title="Growth tree"
        subtitle="Every member, and the member who brought them in — click a name for their promotion history"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Members in a line"
          value={s.with_referrer}
          note={`of ${s.total} on record`}
        />
        <Kpi label="Members who recruited" value={s.recruiters} note="brought in at least one" />
        <Kpi label="Longest line" value={s.largest_line} note="members below one recruiter" />
        <Kpi label="Deepest generation" value={s.max_depth + 1} note="referrals from the root" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card
          title="Lineage"
          subtitle="Each line starts with a member who has no recorded referrer of their own"
        >
          <GrowthTree tree={tree} />
        </Card>

        <Card
          title="Who is growing the chapter"
          subtitle="By members brought in directly"
          className="self-start"
        >
          {tree.top_recruiters.length === 0 ? (
            <Empty>No referrals recorded yet.</Empty>
          ) : (
            <ul className="-my-1 divide-y divide-surface-rule/70">
              {tree.top_recruiters.map((r) => (
                <li key={r.member_id}>
                  <Link
                    href={`/members/${r.member_id}`}
                    className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-surface-sunken/60"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-jci-blue/10 text-[12px] font-bold text-jci-navy tnum">
                      {r.direct_recruits}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{r.name}</span>
                      <span className="block text-[11px] leading-4 text-ink-faint">
                        {r.line_size} in the line below ·{" "}
                        {/* The post in words, not the raw record. A recruiter
                            list is read fast, and "MAD & BOD & SO & FM" is
                            four codes where one job title was wanted. */}
                        {summarisePosts(parseRecord(r.role_record)).headline ||
                          r.member_class}
                      </span>
                    </span>
                    <ClassChip value={r.member_class ?? "—"} />
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
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
