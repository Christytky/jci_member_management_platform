import catalogue from "@/data/roles.json";

/**
 * Post codes, in words — and which of a member's posts is the headline one.
 *
 * src/roles.py has always exported its catalogue to web/data/roles.json,
 * and nothing read it. So every screen printed raw codes: "P & BOD & FM"
 * asked the reader to know that P is the President, that BOD is a seat on
 * the board, and that FM is not a post at all but the membership class
 * everybody has. Three unequal things joined by ampersands, in a string
 * that gives the most important one no more weight than the least.
 *
 * This module is the fix, and it is a wording fix rather than a data one:
 * the same derivation, said in words, with the post that matters first.
 */

type TierInfo = {
  tier: string;
  rank: number;
  slug: string;
  level: number;
  level_label: string;
};

const BY_TIER: Record<string, TierInfo> = Object.fromEntries(
  (catalogue.tiers as TierInfo[]).map((t) => [t.tier, t]),
);

/**
 * The permission level, as a number people say.
 *
 * Level 1 is the top. The internal rank runs the other way — it counts UP
 * with seniority because it is the comparison key the highest-post-wins
 * derivation uses — so these two numbers are inverses, and reading the
 * wrong one would label the President "level 4". src/roles.py derives the
 * display number and ships it, so neither side computes it twice.
 */
export function levelNumber(tier: string | null | undefined): number | null {
  if (!tier) return null;
  return BY_TIER[tier]?.level ?? null;
}

/** "Level 1 — President + MA". The number leads, the name explains it. */
export function levelLabel(tier: string | null | undefined): string {
  if (!tier) return "";
  return BY_TIER[tier]?.level_label ?? tier;
}

/** "Level 1", for places too tight for the name. */
export function levelShort(tier: string | null | undefined): string {
  const n = levelNumber(tier);
  return n === null ? (tier ?? "") : `Level ${n}`;
}

export type PostInfo = {
  code: string;
  label: string;
  kind: string;
  tier: string;
  rank: number;
};

const BY_CODE: Record<string, PostInfo> = Object.fromEntries(
  (catalogue.roles as PostInfo[]).map((r) => [r.code, r]),
);

/** "P" -> "President". An unknown code is returned as written. */
export function postLabel(code: string | null | undefined): string {
  if (!code) return "";
  return BY_CODE[code]?.label ?? code;
}

export function postInfo(code: string): PostInfo | null {
  return BY_CODE[code] ?? null;
}

/** A membership class is not a post — it is what everyone in the chapter is. */
export function isClass(code: string): boolean {
  return BY_CODE[code]?.kind === "class";
}

export type PostSummary = {
  /** The post to show: the highest-ranked one held, in words. */
  headline: string;
  /** Its code, for the derivation line. */
  headlineCode: string | null;
  /** Everything else held, in words — the tooltip. */
  others: string[];
  /** True when this person holds no post at all beyond their class. */
  classOnly: boolean;
  /** "President · also Board of Directors, Full Member" — the tooltip. */
  full: string;
};

/**
 * Split a role record into the post that leads and the posts that follow.
 *
 * The codes arrive already sorted highest-tier-first by src/roles.roles_for,
 * so the headline is the first one that is an actual post. A member holding
 * only their class has no headline post, and saying "Full Member" loudly
 * would be inventing a rank that is not there.
 */
export function summarisePosts(codes: string[]): PostSummary {
  const clean = codes.filter(Boolean);
  const posts = clean.filter((c) => !isClass(c));
  const headlineCode = posts[0] ?? null;
  // Whichever code the headline used up — the highest post, or the class
  // when there is no post. Without tracking it, a member whose record is
  // just "FM" reads "Full Member +1", counting the class as both the
  // headline and a thing held besides it.
  const consumed = headlineCode ?? clean[0] ?? null;
  const others = clean.filter((c) => c !== consumed).map(postLabel);
  const headline = postLabel(consumed);

  return {
    headline,
    headlineCode,
    others,
    classOnly: posts.length === 0,
    full: headline + (others.length ? ` · also ${others.join(", ")}` : ""),
  };
}

/** Accepts the stored record, "MAD; BOD; FM" or "MAD & BOD & FM". */
export function parseRecord(record: string | null | undefined): string[] {
  if (!record) return [];
  return record
    .split(/[;&]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
