import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { getSession, type Session, type Tier } from "@/lib/auth";

/**
 * Server-only payload access.
 *
 * The "server-only" import above is load-bearing: it makes the build fail
 * if any client component ever imports this file. That is the guardrail
 * behind PRD 11's requirement that hidden fields never reach the browser.
 * Each file was already filtered by permissions.apply() at build time, so a
 * tier that cannot see a field has no file containing it.
 *
 * Which file a request gets is decided by the signed-in user's PERMISSION
 * TIER, and that tier came from their role record -- highest role wins. A
 * member on the Member tier is served a file holding exactly one row: their
 * own. Not a filtered view of everyone's; a file that never contained
 * anyone else.
 */

export type Member = {
  member_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  member_class: "PM" | "FM" | "SM";
  member_status: string;
  date_joined: string | null;
  induction_date: string | null;
  years_membership: number | null;
  board_post_2026: string | null;
  is_bod_2026: string | null;
  senior_designation: string | null;
  senior_transfer_year: number | null;
  // contact
  mobile?: string | null;
  personal_email?: string | null;
  jci_email?: string | null;
  whatsapp_groups?: string | null;
  // personal (absent for Board/Chairman)
  date_of_birth?: string | null;
  gender?: string | null;
  age?: number | string | null;
  // professional
  company?: string | null;
  job_title?: string | null;
  industry?: string | null;
  areas_of_interest?: string | null;
  // finance (absent for Board/Chairman)
  fee_status_current?: string | null;
  fee_submission_date?: string | null;
  prior_unpaid_years?: number | null;
  lapse_count?: number | null;
  // governance (absent for Board/Chairman and Member)
  bod_motion_date?: string | null;
  bod_motion_result?: string | null;
  status_reason?: string | null;
  remark?: string | null;
  // role record and the tier it earns (identity group)
  roles?: string | null;
  role_record?: string | null;
  permission_tier?: string | null;
  governing_role?: string | null;
  tier_rank?: number | null;
  // analytics (absent for Board/Chairman)
  health_score?: number | null;
  health_band?: string | null;
  health_note?: string | null;
  fm_status?: string | null;
  fm_deadline?: string | null;
  fm_teams_counted?: number | null;
  days_to_fm_deadline?: number | null;
  project_role_2026?: string | null;
  mfg_attended_2026?: number | null;
  months_since_last_event?: number | null;
  last_event_date?: string | null;
  hs_fee?: number | null;
  hs_attendance?: number | null;
  hs_role?: number | null;
  hs_recency?: number | null;
  hs_compliance?: number | null;
};

export type Alert = {
  member_id: string;
  member_name: string;
  rule: string;
  rule_no: number;
  detail: string;
  days: number | null;
  owner_post: string;
  severity: "At risk" | "Action" | "Watch";
};

export type StatusEvent = {
  event_id: string;
  member_id: string;
  event_date: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_class: string | null;
  to_class: string | null;
  reason: string | null;
  recorded_by: string | null;
};

export type FeeRecord = {
  member_id: string;
  fee_year: number;
  class_that_year: string;
  status: string;
  submission_date: string | null;
  remark: string | null;
};

export type OcRow = {
  member_id: string;
  year: number;
  project_name: string;
  project_type: string;
  project_role: string;
  date_joined_project: string | null;
  counts_toward_fm: string;
};

/** One class's average age against the 40-year senior-transfer ceiling. */
export type AgeRing = {
  member_class: string;
  label: string;
  count: number;
  average_age: number | null;
  /** 0-1. The arc length, already capped so it cannot overshoot the ring. */
  pct_of_cap: number;
  years_headroom: number | null;
  oldest: number | null;
  youngest: number | null;
  within_two_years: number;
  cap: number;
};

export type TreeNode = {
  member_id: string;
  name: string | null;
  member_class: string | null;
  member_status: string | null;
  date_joined: string | null;
  role_record: string | null;
  permission_tier: string | null;
  referred_by: string | null;
  depth: number;
  direct_recruits: number;
  line_size: number;
};

export type GrowthTree = {
  nodes: TreeNode[];
  roots: string[];
  stats: {
    total: number;
    with_referrer: number;
    recruiters: number;
    max_depth: number;
    largest_line: number;
  };
  top_recruiters: TreeNode[];
};

export type Dashboard = {
  kpis: Record<string, number>;
  movement: { year: number; joined: number; inducted: number; senior: number; departed: number }[];
  funnel: { stage: string; count: number }[];
  departures: { reason: string; count: number }[];
  needs_attention: { member_id: string; name: string; score: number; reasons: string[] }[];
  /** Present only for a tier with unmasked access to the personal group. */
  age_rings?: AgeRing[];
  /** Present only in the file served to a tier that may open /growth. */
  growth_tree?: GrowthTree;
};

export type Access = {
  tier: Tier;
  tier_rank: number;
  visible_groups: string[];
  hidden_groups: string[];
  /** Present but blurred — age bands rather than dates of birth. */
  masked_groups: string[];
  banner: string;
  pages: Record<string, boolean>;
  can_write: boolean;
  column_count: number;
  total_fields: number;
};

export type Payload = {
  /** The signed-in user. Not a persona -- an account. */
  viewer: {
    username: string;
    name: string;
    member_id: string;
    tier: Tier;
    roles: string[];
    role_record: string;
    governing_role: string | null;
    post: string;
  };
  as_of: string;
  access: Access;
  members: Member[];
  alerts: Alert[];
  events: StatusEvent[];
  fees: FeeRecord[];
  oc: OcRow[];
  projects: { project_name: string; project_type: string; chairman_id: string | null; so_id: string | null; oc_count: number; team_size: number }[];
  dashboard: Dashboard | null;
};

export type TierSummary = {
  tier: Tier;
  slug: string;
  rank: number;
  columns: number;
  members: number;
  alerts: number;
  hidden: string[];
  pages: string[];
  roles: string[];
};

const DATA_DIR = path.join(process.cwd(), "data");

/** Tier -> file stem. The Member tier has no shared file, by design. */
const TIER_SLUG: Record<Tier, string> = {
  "President + MA": "admin",
  "HS + FD": "secretariat",
  "Board / Chairman / SO": "leader",
  Member: "member",
};

const cache = new Map<string, Omit<Payload, "viewer">>();

export async function listTiers(): Promise<TierSummary[]> {
  const raw = await fs.readFile(path.join(DATA_DIR, "tiers.json"), "utf8");
  return JSON.parse(raw) as TierSummary[];
}

async function readJson<T>(...segments: string[]): Promise<T> {
  const key = segments.join("/");
  const cached = cache.get(key);
  if (cached) return cached as T;
  const raw = await fs.readFile(path.join(DATA_DIR, ...segments), "utf8");
  const parsed = JSON.parse(raw) as T;
  cache.set(key, parsed as Omit<Payload, "viewer">);
  return parsed;
}

/**
 * Thrown when a page is rendered without a session. Pages call
 * requirePayload(), which redirects instead -- this exists so that a future
 * caller that forgets fails loudly rather than rendering an empty shell.
 */
export class NotSignedIn extends Error {
  constructor() {
    super("No signed-in user");
    this.name = "NotSignedIn";
  }
}

/**
 * The payload for the signed-in user, chosen by their permission tier.
 *
 * A Member is served data/members/<their id>.json. Note what is NOT
 * happening: there is no filter here, no "where member_id equals". The file
 * itself contains one member, because permissions.apply() built it that way
 * at export time. A bug in this function cannot widen it.
 */
export async function getPayloadFor(session: Session): Promise<Payload> {
  const base =
    session.tier === "Member"
      ? await readJson<Omit<Payload, "viewer">>("members", `${session.member_id}.json`)
      : await readJson<Omit<Payload, "viewer">>(`payload.${TIER_SLUG[session.tier]}.json`);

  const self = base.members.find((m) => m.member_id === session.member_id);

  return {
    ...base,
    viewer: {
      username: session.username,
      name: session.display_name,
      member_id: session.member_id,
      tier: session.tier,
      roles: session.roles,
      role_record: session.role_record,
      governing_role: session.governing_role,
      post: self?.board_post_2026 || session.governing_role || "Member",
    },
  };
}

export async function getPayload(): Promise<Payload> {
  const session = await getSession();
  if (!session) throw new NotSignedIn();
  return getPayloadFor(session);
}

/** The payload, or null when nobody is signed in. For layouts that redirect. */
export async function tryGetPayload(): Promise<Payload | null> {
  const session = await getSession();
  return session ? getPayloadFor(session) : null;
}

export async function getMember(id: string): Promise<{ payload: Payload; member: Member | null }> {
  const payload = await getPayload();
  return { payload, member: payload.members.find((m) => m.member_id === id) ?? null };
}

/** True when this tier may open the page at all (PRD 6.2, 6.6, 6.7). */
export function canOpen(payload: Payload, page: string): boolean {
  return payload.access.pages[page] === true;
}

/** True only for the tier that owns the member database (President + MA). */
export function canWrite(payload: Payload): boolean {
  return payload.access.can_write === true;
}
