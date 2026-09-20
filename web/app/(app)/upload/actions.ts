"use server";

import { revalidatePath } from "next/cache";

import { record } from "@/lib/activity";
import { applyWorkbook, stageWorkbook, type UploadReport } from "@/lib/admin";
import { getSession } from "@/lib/auth";
import { clearPayloadCache, getPayloadFor } from "@/lib/data";

export type UploadState = {
  staged?: string;
  report?: UploadReport;
  applied?: boolean;
  log?: string;
  error?: string;
} | null;

/**
 * Every action here re-checks the tier server-side.
 *
 * The page will not render the form for anyone else, but a page not
 * rendering a button is not an access control -- a server action is a POST
 * endpoint, reachable by anyone who knows it exists. The check that matters
 * is this one, and it reads the tier from the account, which came from the
 * member's role record.
 */
async function requireWriter() {
  const session = await getSession();
  if (!session) return null;
  const payload = await getPayloadFor(session);
  return payload.access.can_write ? { session, payload } : null;
}

export async function stage(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const who = await requireWriter();
  if (!who) return { error: "Only the President and the MA team may update the member database." };

  const file = formData.get("workbook");
  if (!(file instanceof File)) return { error: "Choose a workbook to upload." };

  const result = await stageWorkbook(file, who.session.member_id);
  if ("error" in result) return { error: result.error };

  record({
    actor_name: who.session.display_name,
    actor_role: who.payload.access.tier,
    action: "UPLOAD",
    detail:
      `Staged ${file.name} (${(file.size / 1024).toFixed(0)} KB) · ` +
      `${result.report.ok ? "passed checks" : `${result.report.problems?.length ?? 0} problem(s)`} · not yet applied`,
  });

  revalidatePath("/upload");
  return { staged: result.name, report: result.report };
}

export async function apply(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const who = await requireWriter();
  if (!who) return { error: "Only the President and the MA team may update the member database." };

  const name = String(formData.get("staged") ?? "");
  if (!name) return { error: "Nothing staged to apply." };

  const result = await applyWorkbook(name);

  record({
    actor_name: who.session.display_name,
    actor_role: who.payload.access.tier,
    action: "UPLOAD",
    detail: result.ok
      ? `Applied ${name} · database reloaded and every tier payload rebuilt`
      : `Apply refused for ${name} · ${result.error}`,
  });

  // Payloads on disk have changed; every cached render of them is stale.
  // Both caches have to go: the parsed-JSON map in lib/data.ts, which
  // revalidatePath does not reach, and Next's own render cache.
  clearPayloadCache();
  revalidatePath("/", "layout");
  return result.ok
    ? { applied: true, log: result.log, staged: name }
    : { error: result.error, log: result.log, staged: name };
}
