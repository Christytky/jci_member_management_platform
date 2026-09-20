"use server";

import { record, type LogAction } from "@/lib/activity";
import { getSession } from "@/lib/auth";

/**
 * Shared server actions for the signed-in app.
 *
 * switchPersona() used to live here. It is gone: there is no persona to
 * switch to. A user's access follows their role record, so the only way to
 * see the app as someone else is to be someone else.
 */

/** Logged whenever a restricted field group is rendered (PRD 6.5). */
export async function logView(entry: {
  action: LogAction;
  target_member_id?: string | null;
  field_group?: string | null;
  detail?: string;
}) {
  const session = await getSession();
  if (!session) return;
  record({ actor_name: session.display_name, actor_role: session.tier, ...entry });
}
