import { LogOut } from "lucide-react";

import { signOut } from "@/app/login/actions";
import type { Payload } from "@/lib/data";
import { levelLabel, postLabel, summarisePosts } from "@/lib/posts";

/**
 * Who is signed in, and why they can see what they can see.
 *
 * This replaces the "viewing as" dropdown, and it is deliberately not a
 * control. The old switcher invited the question the whole redesign
 * answers: if a user can pick their role, the role is not a permission.
 * What sits here instead is the derivation, shown in full -- every role on
 * the record, the one that won, and the tier it produced.
 */
export function AccountCard({ payload }: { payload: Payload }) {
  const { viewer, access } = payload;
  const posts = summarisePosts(viewer.roles);
  const initials = viewer.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="px-3 pb-3">
      <div className="rounded-xl border border-surface-rule bg-surface-sunken p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-jci-navy text-[11px] font-bold uppercase text-white">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold">{viewer.name}</span>
            <span className="block truncate text-[10.5px] text-ink-faint">
              {viewer.username}
            </span>
          </span>
        </div>

        <div className="mt-2.5 border-t border-surface-rule pt-2.5">
          {/* The post first, in words and on its own line. It used to be one
              chip among several identical ones, so "President" sat level
              with "Full Member" and the reader had to know which mattered. */}
          <div className="label">Post</div>
          <p className="mt-0.5 text-[12px] font-semibold leading-4 text-jci-navy">
            {posts.headline}
          </p>
          {posts.others.length > 0 && (
            <p
              className="mt-0.5 text-[10.5px] leading-4 text-ink-faint"
              title={`Also held — ${posts.others.join(", ")}`}
            >
              also {posts.others.join(", ")}
            </p>
          )}

          <div className="label mt-2.5">Permission level</div>
          <p className="mt-0.5 text-[11.5px] leading-4 text-ink">
            <strong className="font-semibold">{levelLabel(access.tier)}</strong>
          </p>
          {viewer.governing_role && (
            <p className="mt-0.5 text-[10.5px] leading-4 text-ink-faint">
              earned by {postLabel(viewer.governing_role)}, the highest post held
            </p>
          )}
          <p className="mt-1 text-[10.5px] leading-4 text-ink-faint tnum">
            {access.column_count} of {access.total_fields} fields readable
          </p>
          {/* The write half, said as plainly as the read half. A level with
              no editable group is told so, rather than left to discover it
              by finding no pencils. */}
          <p className="mt-0.5 text-[10.5px] leading-4 text-ink-faint">
            {access.editable_groups.length > 0
              ? `${access.editable_groups.join(", ")} editable`
              : "read-only on member records"}
          </p>
        </div>

        <form action={signOut} className="mt-2.5">
          <button
            type="submit"
            className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg
                       border border-surface-rule bg-surface py-1.5 text-[11.5px] font-semibold
                       text-ink-muted transition-colors hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
