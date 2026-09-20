import { ShieldCheck, EyeOff } from "lucide-react";

import type { Payload } from "@/lib/data";

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
        {/* The role record, then the tier. Both, always -- the distinction
            between them is the thing this strip exists to make obvious. */}
        <span title="Every role held, highest first">{payload.viewer.role_record}</span>
        <span aria-hidden className="px-1 opacity-40">
          →
        </span>
        <strong className="font-semibold">{payload.access.tier}</strong>
        {payload.viewer.governing_role && <> via {payload.viewer.governing_role}</>}
      </span>
      <span aria-hidden className="opacity-40">
        —
      </span>
      <span>
        {full ? (
          <>full access to all {payload.access.total_fields} fields</>
        ) : (
          <>
            {hidden.length > 0 && phrase(hidden, "hidden")}
            {hidden.length > 0 && masked.length > 0 && <>; </>}
            {masked.length > 0 && phrase(masked, "shown as five-year bands")}{" "}
            by your access level
          </>
        )}
      </span>
      <span className="ml-auto text-[11px] font-semibold tnum opacity-70">
        {payload.access.column_count} of {payload.access.total_fields} fields loaded
      </span>
    </div>
  );
}
