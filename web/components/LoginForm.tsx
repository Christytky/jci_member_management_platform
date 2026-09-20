"use client";

import { useActionState, useState } from "react";
import { AlertCircle, ChevronDown, LoaderCircle } from "lucide-react";

import { signIn } from "@/app/login/actions";
import type { DemoAccount } from "@/lib/auth";
import { levelLabel, parseRecord, summarisePosts } from "@/lib/posts";

/**
 * The form itself. A client component only so it can show a pending state
 * and a failure message -- the credentials go straight to a server action,
 * and no account data of any kind reaches this file beyond the seeded demo
 * logins the server chose to print.
 */
export function LoginForm({ demo }: { demo: DemoAccount[] }) {
  const [state, action, pending] = useActionState(signIn, null);
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<DemoAccount | null>(null);

  return (
    <>
      <form action={action} className="mt-7 max-w-[380px] space-y-4">
        <div>
          <label htmlFor="username" className="label mb-1.5 block">
            JCI Victoria address
          </label>
          <input
            id="username"
            name="username"
            type="email"
            autoComplete="username"
            required
            defaultValue={prefill?.username ?? ""}
            key={`u-${prefill?.username ?? ""}`}
            placeholder="name@vjc.org.hk"
            className="focus-ring w-full rounded-xl border border-surface-rule bg-surface px-3.5
                       py-2.5 text-[13px] text-ink placeholder:text-ink-faint"
          />
        </div>

        <div>
          <label htmlFor="password" className="label mb-1.5 block">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            defaultValue={prefill?.password ?? ""}
            key={`p-${prefill?.username ?? ""}`}
            className="focus-ring w-full rounded-xl border border-surface-rule bg-surface px-3.5
                       py-2.5 text-[13px] text-ink"
          />
        </div>

        {state?.error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-risk/10 px-3.5 py-2.5 text-[12.5px] leading-5 text-risk"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl
                     bg-jci-blue px-4 py-2.5 text-[13px] font-semibold text-white
                     transition-colors hover:bg-jci-navy disabled:opacity-60"
        >
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          {pending ? "Checking…" : "Sign in"}
        </button>
      </form>

      {demo.length > 0 && (
        <div className="mt-7 max-w-[380px]">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="focus-ring flex w-full items-center gap-1.5 rounded-lg py-1 text-[12px] font-semibold text-jci-navy"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
            Demonstration logins ({demo.length})
          </button>

          {open && (
            <div className="mt-2.5 overflow-hidden rounded-xl border border-surface-rule">
              {demo.map((d) => (
                <button
                  key={d.username}
                  type="button"
                  onClick={() => setPrefill(d)}
                  className="focus-ring flex w-full items-start gap-3 border-b border-surface-rule
                             px-3.5 py-2.5 text-left last:border-b-0 hover:bg-surface-sunken"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold">{d.display_name}</span>
                    <span className="block truncate text-[11px] text-ink-faint tnum">
                      {d.username}
                    </span>
                    {/* The post, then the permission level it earns. Showing
                        both side by side is the fastest way to make the rule
                        legible: a Chairman who is also an NVP and an FM is
                        not three levels of access, it is one. The post is in
                        words, and the rest of the record is in the tooltip —
                        a list of codes made the reader do the decoding at the
                        one moment they have no context yet. */}
                    <span className="mt-1 block text-[11px] leading-4 text-ink-muted">
                      {(() => {
                        const posts = summarisePosts(parseRecord(d.role_record));
                        return (
                          <>
                            <span
                              className="font-semibold text-ink"
                              title={`Posts held — ${posts.full}`}
                            >
                              {posts.headline}
                            </span>
                          </>
                        );
                      })()}
                      <span className="px-1 opacity-40">→</span>
                      {levelLabel(d.permission_tier)}
                    </span>
                  </span>
                </button>
              ))}
              <p className="bg-surface-sunken px-3.5 py-2 text-[10.5px] leading-4 text-ink-faint">
                Click one to fill the form. Seeded passwords on synthetic data — set
                JCI_DEMO_ACCOUNTS=0 and rebuild to remove this panel.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
