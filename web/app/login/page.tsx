import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { LoginForm } from "@/components/LoginForm";
import { demoAccounts, getSession } from "@/lib/auth";

export const metadata = { title: "Sign in — JCI Victoria Smart Member Management Platform" };

/**
 * The sign-in screen.
 *
 * What it is replacing: one shared account and a "viewing as" dropdown.
 * That arrangement could show the access model but could never enforce it,
 * and the activity log could only ever record which persona was selected,
 * not who selected it.
 *
 * The panel on the right is the explanation the chapter needs to hear once:
 * your role record is the input, your access is the output, and nobody
 * types the second one in.
 */
export default async function LoginPage() {
  if (await getSession()) redirect("/");
  const demo = await demoAccounts();

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-5 py-10">
      <div className="grid w-full max-w-[940px] grid-cols-1 overflow-hidden rounded-2xl bg-surface shadow-lift lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="px-8 py-9 sm:px-10">
          <div className="mb-7 flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-jci-blue text-[14px] font-bold text-white">
              JCI
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold tracking-tight">JCI Victoria</div>
              <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                Smart Member Management Platform
              </div>
            </div>
          </div>

          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.02em]">
            Sign in to your own account
          </h1>
          <p className="mt-2 max-w-[46ch] text-[13px] leading-5 text-ink-muted">
            Every member has a login. What you can see is decided by the posts on your
            record — you are never asked to choose a role.
          </p>

          <LoginForm demo={demo} />
        </div>

        <aside className="border-t border-surface-rule bg-surface-sunken px-8 py-9 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-jci-navy">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            How access is decided
          </div>

          <ol className="mt-4 space-y-4 text-[12.5px] leading-5 text-ink-muted">
            <li>
              <span className="label block">1 · The posts you hold</span>
              <span className="mt-1 block">
                Every post you hold, exactly as the chapter records it — class, board
                post, project post, national post.
              </span>
            </li>
            <li>
              <span className="label block">2 · The highest post wins</span>
              <span className="mt-1 block">
                A record reading{" "}
                <strong className="font-semibold text-ink">FM &amp; MA</strong> is an MA
                on this system, not a Full Member. The permission level is the highest of
                the posts held, never the first one listed.
              </span>
            </li>
            <li>
              <span className="label block">3 · The level picks the fields</span>
              <span className="mt-1 block">
                Fields outside your level are dropped before the page is built. They are
                not hidden with styling — they are absent from the response.
              </span>
            </li>
          </ol>

          <p className="mt-6 border-t border-surface-rule pt-4 text-[11px] leading-4 text-ink-faint">
            Demonstration on synthetic member data. Contact details are generated, not
            real. Removed and resigned members keep their record but cannot sign in.
          </p>
        </aside>
      </div>
    </div>
  );
}
