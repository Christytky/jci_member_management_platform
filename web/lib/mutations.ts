import "server-only";

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { clearPayloadCache } from "@/lib/data";

/**
 * The per-field write path: one member field, one record added, one erased.
 *
 * It does not reimplement a single rule. Every check -- which permission
 * level may write which field group, what counts as a valid mobile number,
 * whether a class change owes the journey an event -- lives in
 * src/mutations.py, beside the matrix that grants the right. This file
 * shells out to scripts/mutate.py exactly the way lib/admin.ts shells out
 * to the workbook checker, and for the same reason: a second copy of the
 * rules in TypeScript is a second copy that can disagree with the first.
 *
 * After a write that changed something, the payloads are rebuilt. That is
 * not a cache refresh, it is the permission boundary being re-drawn: each
 * payload holds only the fields its level may see, so a database that has
 * moved on from them is a database whose access rules are stale.
 */

const run = promisify(execFile);

const REPO = path.resolve(process.cwd(), "..");
const PYTHON = process.env.JCI_PYTHON || "python3";

export type MutationResult = {
  ok: boolean;
  changed: boolean;
  detail?: string;
  error?: string;
  member_id?: string;
  field?: string;
  group?: string;
  before?: string | null;
  after?: string | null;
  event?: string | null;
  /** True when the field changed is one that decides somebody's access. */
  grants_access?: boolean;
  orphaned_referrals?: number;
  /** Set when the write landed but the payload rebuild did not. */
  stale?: boolean;
};

type Request =
  | { op: "update"; tier: string; actor: string; member_id: string; field: string; value: string; reason?: string }
  | { op: "create"; tier: string; actor: string; values: Record<string, string> }
  | { op: "delete"; tier: string; actor: string; member_id: string; reason: string };

async function callPython(req: Request): Promise<MutationResult> {
  try {
    // The request goes as one argv entry, not through a shell -- execFile
    // takes an argument vector, so nothing in a member's name or a typed
    // reason can be read as a shell token.
    const { stdout } = await run(
      PYTHON,
      [path.join("scripts", "mutate.py"), JSON.stringify(req)],
      { cwd: REPO, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as MutationResult;
  } catch (err) {
    const e = err as { message?: string };
    return {
      ok: false,
      changed: false,
      error: `Could not run the write checker (${e.message ?? "unknown error"}). Is Python available?`,
    };
  }
}

/**
 * Rebuild every payload from the database that was just written to.
 *
 * Skipped when nothing changed, because re-exporting 150 member files to
 * record that a value was saved over itself is a second of latency for no
 * new fact.
 */
async function rebuild(): Promise<string | null> {
  try {
    await run(PYTHON, [path.join("scripts", "export_json.py")], {
      cwd: REPO,
      timeout: 300_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    clearPayloadCache();
    return null;
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    return e.stderr || e.message || "export_json.py failed";
  }
}

async function writeThenRebuild(req: Request): Promise<MutationResult> {
  const result = await callPython(req);
  if (!result.ok || !result.changed) return result;

  const failure = await rebuild();
  if (failure) {
    // The database moved and the payloads did not. Say so plainly: the
    // change is real but the screen is reading a stale permission boundary.
    return {
      ...result,
      stale: true,
      error:
        "The change was saved, but rebuilding the role payloads failed — the " +
        "screen may be showing the previous values until it is rerun. " +
        `(${failure.slice(0, 200)})`,
    };
  }
  return result;
}

export function updateField(
  tier: string,
  actor: string,
  memberId: string,
  field: string,
  value: string,
  reason?: string,
): Promise<MutationResult> {
  return writeThenRebuild({ op: "update", tier, actor, member_id: memberId, field, value, reason });
}

export function createMember(
  tier: string,
  actor: string,
  values: Record<string, string>,
): Promise<MutationResult> {
  return writeThenRebuild({ op: "create", tier, actor, values });
}

export function deleteMember(
  tier: string,
  actor: string,
  memberId: string,
  reason: string,
): Promise<MutationResult> {
  return writeThenRebuild({ op: "delete", tier, actor, member_id: memberId, reason });
}
