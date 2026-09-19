import "server-only";

import { cookies } from "next/headers";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Server-only payload access.
 *
 * The "server-only" import above is load-bearing: it makes the build fail
 * if any client component ever imports this file. That is the guardrail
 * behind PRD 11's requirement that hidden fields never reach the browser.
 * Each persona's JSON was already filtered by permissions.apply() at build
 * time, so a role that cannot see a field has no file containing it.
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

export type Dashboard = {
  kpis: Record<string, number>;
  movement: { year: number; joined: number; inducted: number; senior: number; departed: number }[];
  funnel: { stage: string; count: number }[];
  departures: { reason: string; count: number }[];
  needs_attention: { member_id: string; name: string; score: number; reasons: string[] }[];
};

export type Payload = {
  persona: { key: string; name: string; role: string; member_id: string; post: string };
  as_of: string;
  access: {
    visible_groups: string[];
    hidden_groups: string[];
    banner: string;
    pages: Record<string, boolean>;
    column_count: number;
  };
  members: Member[];
  alerts: Alert[];
  events: StatusEvent[];
  fees: FeeRecord[];
  oc: OcRow[];
  projects: { project_name: string; project_type: string; chairman_id: string | null; so_id: string | null; oc_count: number; team_size: number }[];
  dashboard: Dashboard | null;
};

export type PersonaSummary = {
  key: string;
  name: string;
  role: string;
  member_id: string;
  post: string;
  columns: number;
  members: number;
  alerts: number;
  hidden: string[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const DEFAULT_PERSONA = "president";

const cache = new Map<string, Payload>();

export async function listPersonas(): Promise<PersonaSummary[]> {
  const raw = await fs.readFile(path.join(DATA_DIR, "personas.json"), "utf8");
  return JSON.parse(raw) as PersonaSummary[];
}

/** The persona key currently selected, from the cookie the switcher sets. */
export async function currentPersonaKey(): Promise<string> {
  const jar = await cookies();
  return jar.get("persona")?.value ?? DEFAULT_PERSONA;
}

export async function getPayload(key?: string): Promise<Payload> {
  const personaKey = key ?? (await currentPersonaKey());
  const personas = await listPersonas();
  const safe = personas.some((p) => p.key === personaKey) ? personaKey : DEFAULT_PERSONA;

  const hit = cache.get(safe);
  if (hit) return hit;

  const raw = await fs.readFile(path.join(DATA_DIR, `payload.${safe}.json`), "utf8");
  const parsed = JSON.parse(raw) as Payload;
  cache.set(safe, parsed);
  return parsed;
}

export async function getMember(id: string): Promise<{ payload: Payload; member: Member | null }> {
  const payload = await getPayload();
  return { payload, member: payload.members.find((m) => m.member_id === id) ?? null };
}

/** True when this role may open the page at all (PRD 6.2, 6.6, 6.7). */
export function canOpen(payload: Payload, page: string): boolean {
  return payload.access.pages[page] === true;
}
