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
  const full = hidden.length === 0;

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
        Viewing as <strong className="font-semibold">{payload.persona.name}</strong> ·{" "}
        {payload.persona.post}
      </span>
      <span aria-hidden className="opacity-40">
        —
      </span>
      <span>
        {full ? (
          <>full access to all 53 fields</>
        ) : (
          <>
            {hidden.map((g) => GROUP_LABEL[g] ?? g).join(", ")}{" "}
            {hidden.length === 1 ? "is" : "are"} hidden by your access level
          </>
        )}
      </span>
      <span className="ml-auto text-[11px] font-semibold tnum opacity-70">
        {payload.access.column_count} of 53 fields loaded
      </span>
    </div>
  );
}
