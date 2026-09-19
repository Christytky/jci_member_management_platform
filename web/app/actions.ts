"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { record, type LogAction } from "@/lib/activity";
import { listPersonas } from "@/lib/data";

/**
 * Switching persona writes a SWITCH_ROLE row and reruns (PRD 6.1).
 * The cookie is read server-side on the next render, so the server picks a
 * different pre-filtered payload -- the new role's restrictions are applied
 * before any HTML is produced, not after it reaches the browser.
 */
export async function switchPersona(key: string) {
  const personas = await listPersonas();
  const next = personas.find((p) => p.key === key);
  if (!next) return;

  const jar = await cookies();
  const prevKey = jar.get("persona")?.value ?? "president";
  const prev = personas.find((p) => p.key === prevKey);

  jar.set("persona", key, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 });

  record({
    actor_name: prev?.name ?? "Unknown",
    actor_role: prev?.role ?? "Unknown",
    action: "SWITCH_ROLE",
    detail: `Switched to ${next.name} (${next.role}) - ${next.columns} columns visible`,
  });

  revalidatePath("/", "layout");
}

/** Logged whenever a restricted field group is rendered (PRD 6.5). */
export async function logView(entry: {
  action: LogAction;
  target_member_id?: string | null;
  field_group?: string | null;
  detail?: string;
}) {
  const jar = await cookies();
  const personas = await listPersonas();
  const me = personas.find((p) => p.key === (jar.get("persona")?.value ?? "president"));
  if (!me) return;
  record({ actor_name: me.name, actor_role: me.role, ...entry });
}
