import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import type { StatusEvent } from "@/lib/data";

/**
 * The promotion ladder for one member.
 *
 * The classification -- which recorded event is a promotion, which is a
 * milestone, which is a setback -- is NOT written here. It is read from
 * data/growth-meta.json, which scripts/export_json.py writes out of
 * src/growth.py. One rule table, in Python, shared by the exporter and the
 * page, so a new event type cannot mean one thing on the dashboard and
 * another on a member record.
 *
 * The steps are built from payload.events, which arrived already scoped to
 * this viewer's tier: a tier that may not read governance has no `reason`
 * column on those rows, so it cannot appear on the ladder either.
 */

export type StepKind = "rung" | "appointment" | "milestone" | "setback";

export type GrowthStep = {
  event_id: string;
  date: string | null;
  kind: StepKind;
  label: string;
  event_type: string;
  from_class: string | null;
  to_class: string | null;
  reason: string | null;
  recorded_by: string | null;
  rank: number;
  /** Years since the previous step. What makes a stalled member obvious. */
  gap_years: number | null;
};

export type PromotionHistory = {
  member_id: string;
  steps: GrowthStep[];
  highest_class: string | null;
  highest_label: string | null;
  posts_held: string[];
  /** Years from joining as PM to induction as FM. Null if not yet inducted. */
  years_to_fm: number | null;
  promotions: number;
};

type GrowthMeta = {
  ladder: { code: string; label: string; rank: number }[];
  event_kinds: Record<string, { kind: StepKind; label: string }>;
  promotion_kinds: StepKind[];
  senior_age: number;
};

let metaCache: GrowthMeta | null = null;

export async function growthMeta(): Promise<GrowthMeta> {
  if (metaCache) return metaCache;
  const raw = await fs.readFile(path.join(process.cwd(), "data", "growth-meta.json"), "utf8");
  metaCache = JSON.parse(raw) as GrowthMeta;
  return metaCache;
}

function yearsBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const from = Date.parse(a);
  const to = Date.parse(b);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round(((to - from) / 31_557_600_000) * 10) / 10;
}

export async function promotionHistory(
  memberId: string,
  events: StatusEvent[],
): Promise<PromotionHistory> {
  const meta = await growthMeta();
  const rank = new Map(meta.ladder.map((l) => [l.code, l.rank]));
  const label = new Map(meta.ladder.map((l) => [l.code, l.label]));

  const rows = events
    .filter((e) => e.member_id === memberId)
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.event_id.localeCompare(b.event_id));

  let previous: string | null = null;
  let joined: string | null = null;
  let inducted: string | null = null;

  const steps: GrowthStep[] = rows.map((e) => {
    const classified = meta.event_kinds[e.event_type] ?? {
      kind: "milestone" as StepKind,
      label: e.event_type,
    };
    if (e.event_type === "Joined as PM") joined = e.event_date;
    if (e.event_type === "Inducted") inducted = e.event_date;

    const step: GrowthStep = {
      event_id: e.event_id,
      date: e.event_date ?? null,
      kind: classified.kind,
      label: classified.label,
      event_type: e.event_type,
      from_class: e.from_class ?? null,
      to_class: e.to_class ?? null,
      reason: e.reason ?? null,
      recorded_by: e.recorded_by ?? null,
      rank: rank.get(e.to_class ?? "") ?? 0,
      gap_years: yearsBetween(previous, e.event_date ?? null),
    };
    if (e.event_date) previous = e.event_date;
    return step;
  });

  const reached = steps
    .filter((s) => s.kind === "rung" && s.to_class)
    .map((s) => s.to_class as string);
  const highest =
    reached.length > 0
      ? reached.reduce((a, b) => ((rank.get(b) ?? 0) > (rank.get(a) ?? 0) ? b : a))
      : null;

  return {
    member_id: memberId,
    steps,
    highest_class: highest,
    highest_label: highest ? (label.get(highest) ?? highest) : null,
    posts_held: steps.filter((s) => s.kind === "appointment").map((s) => s.label),
    years_to_fm: yearsBetween(joined, inducted),
    promotions: steps.filter((s) => meta.promotion_kinds.includes(s.kind)).length,
  };
}
