"use server";

import { revalidatePath } from "next/cache";

import { record } from "@/lib/activity";
import { levelLabel } from "@/lib/posts";
import { getSession } from "@/lib/auth";
import { getPayloadFor, type Payload } from "@/lib/data";
import { createMember, deleteMember, updateField } from "@/lib/mutations";

/**
 * Create, update and delete on a member record.
 *
 * Every action re-reads the permission level from the session and checks it
 * before writing, and then scripts/mutate.py checks it again in Python. That
 * is not belt and braces for its own sake: a server action is a POST
 * endpoint reachable by anyone who knows its id, so a page that does not
 * draw an input is not an access control. The check that counts is the one
 * that runs on the request.
 */

export type WriteState = {
  ok?: boolean;
  message?: string;
  error?: string;
  field?: string;
  member_id?: string;
} | null;

async function actor(): Promise<{ payload: Payload; name: string } | null> {
  const session = await getSession();
  if (!session) return null;
  const payload = await getPayloadFor(session);
  return { payload, name: session.display_name };
}

export async function saveField(_prev: WriteState, formData: FormData): Promise<WriteState> {
  const who = await actor();
  if (!who) return { error: "Your session has expired. Sign in again." };

  const memberId = String(formData.get("member_id") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "");
  const group = String(formData.get("group") ?? "");

  // The level's own answer, before the write is attempted. Python refuses
  // it too; this is what turns "it silently did nothing" into a sentence.
  if (!who.payload.access.editable_groups.includes(group)) {
    return {
      error: `${levelLabel(who.payload.access.tier)} may read ${group || "this field"} but not change it.`,
      field,
    };
  }

  const result = await updateField(
    who.payload.access.tier,
    who.name,
    memberId,
    field,
    value,
    String(formData.get("reason") ?? "") || undefined,
  );

  if (!result.ok) return { error: result.error ?? "The change was refused.", field };
  if (!result.changed) return { ok: true, message: result.detail, field };

  record({
    actor_name: who.name,
    actor_role: who.payload.access.tier,
    // A post change is not an address change. Logged as what it is, so the
    // Activity page shows access being granted rather than a field edited.
    action: result.grants_access ? "EDIT_ACCESS" : "EDIT",
    target_member_id: memberId,
    field_group: result.group ?? group,
    detail:
      (result.detail ?? "") +
      (result.event ? ` · journey event recorded: ${result.event}` : "") +
      (result.grants_access ? " · this changes what that member may see" : ""),
  });

  revalidatePath("/", "layout");
  return {
    ok: true,
    message: result.stale ? result.error : result.detail,
    field,
    member_id: memberId,
  };
}

export async function addMember(_prev: WriteState, formData: FormData): Promise<WriteState> {
  const who = await actor();
  if (!who) return { error: "Your session has expired. Sign in again." };
  if (!who.payload.access.can_create) {
    return { error: "Only the President and the MA team may add a member to the chapter." };
  }

  // Only fields this level may actually write are forwarded. Anything else
  // on the form is dropped here and would be refused in Python regardless.
  const values: Record<string, string> = {};
  for (const name of Object.keys(who.payload.access.writable_fields)) {
    const v = formData.get(name);
    if (typeof v === "string" && v.trim()) values[name] = v.trim();
  }

  const result = await createMember(who.payload.access.tier, who.name, values);
  if (!result.ok) return { error: result.error ?? "The record was not created." };

  record({
    actor_name: who.name,
    actor_role: who.payload.access.tier,
    action: "CREATE",
    target_member_id: result.member_id ?? null,
    field_group: "identity",
    detail: result.detail ?? "Member added",
  });

  revalidatePath("/", "layout");
  return { ok: true, message: result.detail, member_id: result.member_id };
}

export async function removeMember(_prev: WriteState, formData: FormData): Promise<WriteState> {
  const who = await actor();
  if (!who) return { error: "Your session has expired. Sign in again." };
  if (!who.payload.access.can_delete) {
    return { error: "Only the President and the MA team may erase a member record." };
  }

  const memberId = String(formData.get("member_id") ?? "");
  const reason = String(formData.get("reason") ?? "");

  // Typing the id is the confirmation. A button that erases a record and
  // everything joined to it should not be reachable by one misplaced click.
  if (String(formData.get("confirm") ?? "").trim() !== memberId) {
    return { error: `Type ${memberId} to confirm. Nothing was changed.` };
  }

  const result = await deleteMember(who.payload.access.tier, who.name, memberId, reason);
  if (!result.ok) return { error: result.error ?? "The record was not erased." };

  record({
    actor_name: who.name,
    actor_role: who.payload.access.tier,
    action: "DELETE",
    target_member_id: memberId,
    field_group: "identity",
    detail: result.detail ?? `Erased ${memberId}`,
  });

  revalidatePath("/", "layout");
  return { ok: true, message: result.detail };
}
