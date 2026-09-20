"use server";

import { redirect } from "next/navigation";

import { record } from "@/lib/activity";
import { levelLabel } from "@/lib/posts";
import { endSession, getSession, startSession, verifyCredentials } from "@/lib/auth";

/**
 * Sign-in. Returns a message on failure and redirects on success.
 *
 * Every attempt is written to the activity log, success or not, with the
 * username that was tried. That is the point of individual accounts: the
 * log now names a person rather than the persona that was selected in a
 * dropdown.
 */
export async function signIn(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!username.trim() || !password) {
    return { error: "Enter your JCI Victoria address and password." };
  }

  const session = await verifyCredentials(username, password);

  if (!session) {
    record({
      actor_name: username.trim().toLowerCase(),
      actor_role: "—",
      action: "SIGN_IN_FAILED",
      detail: "Sign-in refused",
    });
    // One message for a wrong password, an unknown address and a disabled
    // account alike. A form that distinguishes them is a membership lookup.
    return { error: "That address and password do not match an active account." };
  }

  await startSession(session.username);

  record({
    actor_name: session.display_name,
    actor_role: session.tier,
    action: "SIGN_IN",
    target_member_id: session.member_id,
    detail:
      `Signed in · posts ${session.role_record} · ` +
      `${levelLabel(session.tier)} via ${session.governing_role ?? "—"}`,
  });

  redirect("/");
}

export async function signOut() {
  const session = await getSession();
  if (session) {
    record({
      actor_name: session.display_name,
      actor_role: session.tier,
      action: "SIGN_OUT",
      target_member_id: session.member_id,
      detail: "Signed out",
    });
  }
  await endSession();
  redirect("/login");
}
