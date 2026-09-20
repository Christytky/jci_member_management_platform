import { ArrowUpRight, CircleDot, Flag, TriangleAlert } from "lucide-react";

import type { GrowthStep, PromotionHistory } from "@/lib/growth";
import { ageRing, ageRingFallback, status } from "@/lib/theme";

/**
 * One member's growth, as a ladder rather than a list of dates.
 *
 * The Journey card next to this one already shows every recorded event in
 * order. This is the different question a President asks: how far has this
 * person actually come, and how long did each step take. So the class rungs
 * are drawn as a ladder with the gap between them written on the rail --
 * "4.1 years" between joining and induction is the sentence that identifies
 * a member the chapter nearly lost, and it is invisible in a date column.
 *
 * Every row rendered here came from the viewer's own payload, which was
 * filtered by tier before it was written. A tier without governance access
 * has no `reason` on these rows, so the setback rows read as "Removed by
 * BOD motion" and stop there.
 */

const KIND_STYLE: Record<
  GrowthStep["kind"],
  { Icon: typeof CircleDot; colour: string; bg: string; label: string }
> = {
  rung: { Icon: ArrowUpRight, colour: "#6E3FA3", bg: "#F1ECF7", label: "Promotion" },
  appointment: { Icon: Flag, colour: "#1F4789", bg: "#E8EEF8", label: "Appointment" },
  milestone: { Icon: CircleDot, colour: status.healthy, bg: "#E7F5F0", label: "Milestone" },
  setback: { Icon: TriangleAlert, colour: status.risk, bg: "#FCE9EA", label: "Setback" },
};

export function PromotionLadder({
  history,
  currentClass,
}: {
  history: PromotionHistory;
  currentClass?: string | null;
}) {
  if (history.steps.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-rule px-5 py-8 text-center text-[13px] text-ink-faint">
        No promotion history recorded for this member.
      </div>
    );
  }

  // Newest first: a President opens this to see where someone is now, and
  // reads downwards only if the answer is not obvious.
  const steps = [...history.steps].reverse();
  const colours = ageRing[currentClass ?? ""] ?? ageRingFallback;

  return (
    <div>
      <dl className="mb-4 grid grid-cols-3 gap-3 rounded-xl bg-surface-sunken px-4 py-3">
        <div>
          <dt className="label">Reached</dt>
          <dd className="mt-0.5 text-[13px] font-semibold" style={{ color: colours.arc }}>
            {history.highest_label ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="label">Steps up</dt>
          <dd className="mt-0.5 text-[13px] font-semibold tnum">{history.promotions}</dd>
        </div>
        <div>
          <dt className="label">PM to FM</dt>
          <dd className="mt-0.5 text-[13px] font-semibold tnum">
            {history.years_to_fm === null ? "—" : `${history.years_to_fm} yrs`}
          </dd>
        </div>
      </dl>

      <ol className="space-y-0">
        {steps.map((s, i) => {
          const style = KIND_STYLE[s.kind];
          const last = i === steps.length - 1;
          return (
            <li key={s.event_id} className="relative flex gap-3">
              {/* The rail, and the gap written on it. */}
              <div className="flex w-7 shrink-0 flex-col items-center">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ background: style.bg, color: style.colour }}
                >
                  <style.Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                {!last && <span className="w-px flex-1 bg-surface-rule" aria-hidden />}
              </div>

              <div className={`min-w-0 flex-1 ${last ? "pb-0" : "pb-4"}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[12.5px] font-semibold">{s.label}</span>
                  {s.from_class && s.to_class && (
                    <span className="chip bg-surface-sunken text-ink-muted">
                      {s.from_class} → {s.to_class}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-faint tnum">
                  {s.date ?? "date not recorded"}
                  {s.gap_years !== null && s.gap_years > 0 && (
                    <>
                      <span className="px-1 opacity-40">·</span>
                      {s.gap_years} yr{s.gap_years === 1 ? "" : "s"} after the previous step
                    </>
                  )}
                  {s.recorded_by && (
                    <>
                      <span className="px-1 opacity-40">·</span>
                      recorded by {s.recorded_by}
                    </>
                  )}
                </div>
                {s.reason && (
                  <div className="mt-0.5 text-[11.5px] leading-4 text-ink-muted">{s.reason}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
