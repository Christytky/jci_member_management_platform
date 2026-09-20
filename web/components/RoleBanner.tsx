import { ShieldCheck, EyeOff } from "lucide-react";

import type { Payload } from "@/lib/data";
import { levelLabel, summarisePosts } from "@/lib/posts";

const GROUP_LABEL: Record<string, string> = {
  identity: "identity",
  contact: "contact details",
  personal: "date of birth",
  professional: "employment",
  finance: "fees",
  governance: "board motions",
  analytics: "health score",
};

/**
 * PRD 13.4: a full-width strip under the header in JCI Blue at 10%.
 * It must be visible in every screenshot you take -- it is the sentence a
 * judge reads while you are still talking.
 */
export function RoleBanner({ payload }: { payload: Payload }) {
  const posts = summarisePosts(payload.viewer.roles);
  const hidden = payload.access.hidden_groups;
  const masked = payload.access.masked_groups;
  // Masked counts. A tier with nothing fully hidden but its dates of birth
  // reduced to five-year bands does not have full access, and the field
  // count on the right of this strip would have contradicted the claim.
  const full = hidden.length === 0 && masked.length === 0;

  const phrase = (groups: string[], verb: string) => (
    <>
      {groups.map((g) => GROUP_LABEL[g] ?? g).join(", ")} {groups.length === 1 ? "is" : "are"}{" "}
      {verb}
    </>
  );

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-8 py-2.5 text-[12.5px] ${
        full
          ? "border-jci-blue/15 bg-jci-blue/10 text-jci-navy"
          : "border-warn/20 bg-warn/10 text-[#8A4A08]"
      }`}
    >
      {full ? (
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
      )}
      <span>
        Signed in as <strong className="font-semibold">{payload.viewer.name}</strong> ·{" "}
        {/* The post, then the permission level it earns. Both, always -- the
            distinction between them is the thing this strip exists to make
            obvious, and it was being undercut by writing the post as a code
            in a list where the class carried the same weight. The headline
            post is in words; the rest of the record is in the tooltip. */}
        <strong className="font-semibold" title={`Posts held — ${posts.full}`}>
          {posts.headline}
        </strong>
        <span aria-hidden className="px-1 opacity-40">
          →
        </span>
        <strong className="font-semibold" title={payload.access.write_banner}>
          {levelLabel(payload.access.tier)}
        </strong>
      </span>
      {/* A middle dot, not a dash: the level label already contains an em
          dash ("Level 1 — President + MA"), and two of them in a row read
          as one run-on phrase rather than two facts. */}
      <span aria-hidden className="opacity-40">
        ·
      </span>
      <span>
        {full ? (
          <>full access to all {payload.access.total_fields} fields</>
        ) : (
          <>
            {hidden.length > 0 && phrase(hidden, "hidden")}
            {hidden.length > 0 && masked.length > 0 && <>; </>}
            {masked.length > 0 && phrase(masked, "shown as five-year bands")}{" "}
            at this permission level
          </>
        )}
      </span>
      <span
        className="ml-auto text-[11px] font-semibold tnum opacity-70"
        title={payload.access.write_banner}
      >
        {payload.access.column_count} of {payload.access.total_fields} fields loaded
        {payload.access.editable_groups.length > 0 && (
          <span className="font-normal">
            {" · "}
            {payload.access.editable_groups.length} editable
          </span>
        )}
      </span>
    </div>
  );
}
