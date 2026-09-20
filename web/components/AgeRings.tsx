import { Info } from "lucide-react";

import type { AgeRing } from "@/lib/data";
import { ageRing, ageRingFallback } from "@/lib/theme";

/**
 * FM and PM average age against the 40-year senior-transfer ceiling.
 *
 * Why a ring rather than a bar: 40 is not a scale maximum chosen to make
 * the chart fit, it is a rule. A member turns 40 and transfers to Senior,
 * whatever anyone would prefer. A closed circle is the one chart shape that
 * shows a fixed ceiling as a boundary rather than as the tallest thing on
 * screen, so "the FM ring is four-fifths full" reads as what it is: this
 * class has about a fifth of its eligible life left.
 *
 * Each ring carries three marks:
 *   track   the full 40 years
 *   arc     the average, on the outer band
 *   range   youngest to oldest, on a thinner inner band
 *
 * The spread sits on its OWN radius rather than under the average arc.
 * Drawn concentrically they overlap, and the only part of the spread still
 * visible is the piece past the average -- which reads as a different
 * statistic than the one the caption promises.
 *
 * Plain SVG, no chart library and no client JavaScript: the numbers were
 * computed in src/growth.py and this only draws them.
 */

const SIZE = 132;
const STROKE = 11;
const R = (SIZE - STROKE * 2) / 2;

/** The spread band: thinner, and tucked just inside the average. */
const INNER_STROKE = 3.5;
const INNER_R = R - STROKE / 2 - INNER_STROKE;

const circumference = (radius: number) => 2 * Math.PI * radius;

/** Fraction of the 40-year cap -> dash pair, clamped so nothing overshoots. */
function arc(fraction: number, radius: number): string {
  const c = circumference(radius);
  const len = c * Math.max(0, Math.min(fraction, 1));
  return `${len} ${c - len}`;
}

export function AgeRings({ rings }: { rings: AgeRing[] }) {
  const cap = rings[0]?.cap ?? 40;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-center gap-7">
        {rings.map((r) => (
          <Ring key={r.member_class} ring={r} />
        ))}
      </div>

      <p className="mt-4 flex items-start gap-2 border-t border-surface-rule pt-3 text-[11px] leading-4 text-ink-faint">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          The full ring is {cap} years — the age at which a member transfers to Senior. The
          thick arc is the average; the thin inner band spans youngest to oldest in that
          class. Active members only.
        </span>
      </p>
    </div>
  );
}

function Ring({ ring }: { ring: AgeRing }) {
  const colours = ageRing[ring.member_class] ?? ageRingFallback;

  if (ring.average_age === null || ring.count === 0) {
    return (
      <figure className="w-[160px] text-center">
        <div
          className="mx-auto flex items-center justify-center rounded-full border border-dashed border-surface-rule text-[11px] text-ink-faint"
          style={{ width: SIZE, height: SIZE }}
        >
          no active {ring.member_class}
        </div>
        <figcaption className="mt-2 text-[12.5px] font-semibold">{ring.label}</figcaption>
      </figure>
    );
  }

  const youngest = ring.youngest ?? 0;
  const oldest = ring.oldest ?? 0;

  return (
    <figure className="w-[160px] text-center">
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={
            `${ring.label}: average age ${ring.average_age} of a ${ring.cap}-year ceiling, ` +
            `${ring.count} active members aged ${youngest} to ${oldest}`
          }
        >
          {/* Rotated so every arc starts at twelve o'clock and runs clockwise. */}
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} fill="none">
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={colours.track}
              strokeWidth={STROKE}
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={colours.arc}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={arc(ring.pct_of_cap, R)}
            />
            {/* Youngest -> oldest, on the inner band. The offset is negative
                because SVG dash offsets run anticlockwise from the path start. */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={INNER_R}
              stroke={colours.range}
              strokeWidth={INNER_STROKE}
              strokeDasharray={arc((oldest - youngest) / ring.cap, INNER_R)}
              strokeDashoffset={-circumference(INNER_R) * (youngest / ring.cap)}
            />
          </g>
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-bold leading-none tnum" style={{ color: colours.arc }}>
            {ring.average_age}
          </span>
          <span className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
            avg of {ring.cap}
          </span>
        </div>
      </div>

      <figcaption className="mt-2.5">
        <div className="text-[12.5px] font-semibold">{ring.label}</div>
        <div className="mt-0.5 text-[11px] leading-4 text-ink-faint tnum">
          {ring.count} active · {youngest}–{oldest} yrs
        </div>
        <div className="mt-1.5 text-[11px] leading-4 text-ink-muted">
          {/* The headroom, not the average, is the number a President acts on. */}
          <strong className="font-semibold text-ink tnum">{ring.years_headroom}</strong> years
          of headroom
        </div>
        {ring.within_two_years > 0 && (
          <div className="mt-1 text-[11px] leading-4 text-warn">
            <span className="tnum">{ring.within_two_years}</span> transfer within 2 years
          </div>
        )}
      </figcaption>
    </figure>
  );
}
