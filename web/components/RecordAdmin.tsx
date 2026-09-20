"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";

import { addMember, removeMember, type WriteState } from "@/app/(app)/members/actions";
import type { WritableField } from "@/lib/data";

/**
 * Adding and erasing a member record. President + MA only.
 *
 * Both are collapsed by default and both are rendered only when the payload
 * says this permission level holds the right, so for the other three levels
 * nothing here exists on the page at all.
 */

const NEW_FIELDS = [
  "first_name", "last_name", "date_joined", "jci_email", "mobile",
  "date_of_birth", "gender", "referred_by", "company", "job_title",
] as const;

export function AddMemberPanel({
  fields,
}: {
  fields: Record<string, WritableField>;
}) {
  const [state, action, pending] = useActionState<WriteState, FormData>(addMember, null);
  const [open, setOpen] = useState(false);

  // Only fields this level may write, in a sensible order for a new record.
  const offered = NEW_FIELDS.map((n) => fields[n]).filter(Boolean) as WritableField[];
  const required = new Set(["first_name", "last_name", "date_joined"]);

  if (!open) {
    return (
      <div className="text-right">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-jci-navy
                     px-3 py-1.5 text-[12px] font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add member
        </button>
        {state?.ok && state.message && (
          <p className="mt-1 text-[11px] text-ok">{state.message}</p>
        )}
      </div>
    );
  }

  return (
    <form
      action={action}
      className="w-full max-w-xl rounded-xl border border-surface-rule bg-surface-sunken p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold">Add a member</h2>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            Joins as a PM with today&rsquo;s record and a journey entry. The member ID is
            allocated, never typed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus-ring rounded p-1 text-ink-faint"
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {offered.map((f) => (
          <label key={f.name} className="block">
            <span className="label">
              {f.label}
              {required.has(f.name) && <span className="text-risk"> *</span>}
            </span>
            {f.choices ? (
              <select
                name={f.name}
                defaultValue=""
                className="focus-ring mt-0.5 w-full rounded-lg border border-surface-rule
                           bg-surface px-2 py-1 text-[12.5px]"
              >
                {f.choices.map((c) => (
                  <option key={c || "—"} value={c}>
                    {c || "— none —"}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.name}
                type={f.kind === "date" ? "date" : "text"}
                required={required.has(f.name)}
                className="focus-ring mt-0.5 w-full rounded-lg border border-surface-rule
                           bg-surface px-2 py-1 text-[12.5px]"
              />
            )}
          </label>
        ))}
      </div>

      {state?.error && <p className="mt-2.5 text-[11.5px] text-risk">{state.error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="focus-ring rounded-lg bg-jci-navy px-3 py-1.5 text-[12px]
                     font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Adding and rebuilding payloads…" : "Add member"}
        </button>
        <span className="text-[11px] text-ink-faint">
          Every permission level&rsquo;s payload is rebuilt after the record is written.
        </span>
      </div>
    </form>
  );
}

export function DeleteMemberPanel({
  memberId,
  name,
  status,
}: {
  memberId: string;
  name: string;
  status: string;
}) {
  const [state, action, pending] = useActionState<WriteState, FormData>(removeMember, null);
  const [open, setOpen] = useState(false);

  if (state?.ok) {
    return (
      <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-[12px] text-ink-muted">
        {state.message} — the directory no longer holds this record.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="mt-5 text-right">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border
                     border-surface-rule px-2.5 py-1 text-[11.5px] text-ink-faint
                     hover:border-risk/40 hover:text-risk"
        >
          <Trash2 className="h-3 w-3" aria-hidden />
          Erase this record
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 rounded-xl border border-risk/25 bg-risk/[0.04] p-4">
      <input type="hidden" name="member_id" value={memberId} />

      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-risk" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-risk">
            Erase {name} ({memberId})
          </h2>
          {/* The distinction that matters, said before the field rather than
              after the mistake: a departure is a status, and it keeps the
              record the movement chart is built from. */}
          <p className="mt-1 text-[11.5px] leading-5 text-ink-muted">
            This destroys the record and every fee, journey event, project line and login
            joined to it. It is <strong className="font-semibold">not</strong> how someone
            leaves the chapter — a departure is a status of Resigned or Removed, which
            keeps the history the movement chart is drawn from. Use this only for a record
            that should not exist.
            {status === "Active" && (
              <>
                {" "}
                <strong className="font-semibold text-risk">
                  This member is Active, so it will be refused until their departure is
                  recorded.
                </strong>
              </>
            )}
          </p>

          <label className="mt-2.5 block">
            <span className="label">Reason — written to the activity log</span>
            <input
              name="reason"
              required
              minLength={10}
              placeholder="At least 10 characters. This is the only trace left."
              className="focus-ring mt-0.5 w-full rounded-lg border border-surface-rule
                         bg-surface px-2 py-1 text-[12.5px]"
            />
          </label>

          <label className="mt-2 block">
            <span className="label">
              Type <span className="tnum font-semibold text-ink">{memberId}</span> to confirm
            </span>
            <input
              name="confirm"
              required
              autoComplete="off"
              className="focus-ring mt-0.5 w-full rounded-lg border border-surface-rule
                         bg-surface px-2 py-1 text-[12.5px] tnum"
            />
          </label>

          {state?.error && <p className="mt-2 text-[11.5px] text-risk">{state.error}</p>}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="focus-ring rounded-lg bg-risk px-3 py-1.5 text-[12px]
                         font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Erasing…" : "Erase permanently"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="focus-ring rounded-lg border border-surface-rule px-3 py-1.5
                         text-[12px] font-semibold text-ink-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
