"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Lock, Pencil, X } from "lucide-react";

import { saveField, type WriteState } from "@/app/(app)/members/actions";
import type { WritableField } from "@/lib/data";
import { Masked } from "@/components/ui";

/**
 * One field of a member record, edited in place.
 *
 * At rest it is the same <dt>/<dd> pair as a read-only field -- same type,
 * same spacing, same grid cell. The only addition is a pencil that appears
 * on hover, and only when `spec` is present, which happens only when the
 * payload said this permission level may write this field group. A level
 * that may read but not change a field gets the plain field back and never
 * learns there was an editor.
 *
 * Nothing here decides anything. The permission check is in Python, in
 * src/mutations.py; this is the affordance, and the server action re-checks
 * the level before it calls out to that.
 */
export function EditableField({
  label,
  value,
  memberId,
  spec,
  mono,
  span,
  masked,
  emptyText,
  hideLabel,
}: {
  label: string;
  value?: string | null;
  memberId: string;
  /** Present only when this permission level may write this field. */
  spec?: WritableField | null;
  mono?: boolean;
  span?: number;
  masked?: boolean;
  /** What an empty value reads as — "not yet" rather than a bare dash. */
  emptyText?: string;
  /** Hide the label visually but keep it for screen readers — table cells
   *  carry their heading in the column, and repeating it reads as noise. */
  hideLabel?: boolean;
}) {
  const [state, action, pending] = useActionState<WriteState, FormData>(saveField, null);
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement | HTMLSelectElement>(null);

  // Close on a save that landed; stay open on a refusal so the value the
  // person typed is still there to correct.
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const cell = span === 2 ? "col-span-2" : undefined;

  // A masked value is a five-year band, not the real one, so there is
  // nothing here to edit -- saving it would write "born 1990-1994" into a
  // date column. The level that may edit it is the level that sees it.
  const editable = Boolean(spec) && !masked;

  if (!editing) {
    return (
      <div className={`group/f ${hideLabel ? "flex items-center gap-1" : ""} ${cell ?? ""}`}>
        <dt className={`label flex items-center gap-1.5 ${hideLabel ? "sr-only" : ""}`}>
          {label}
          {editable && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="focus-ring rounded p-0.5 opacity-0 transition-opacity
                         group-hover/f:opacity-100 focus:opacity-100"
              aria-label={`Edit ${label}`}
              title={`Edit ${label}`}
            >
              <Pencil className="h-3 w-3 text-ink-faint hover:text-jci-navy" aria-hidden />
            </button>
          )}
        </dt>
        <dd
          className={`mt-0.5 text-[13px] ${mono ? "tnum" : ""} ${value ? "" : "text-ink-faint"}`}
        >
          {masked && value ? <Masked value={value} /> : value || emptyText || "—"}
        </dd>
        {state?.message && !state.error && (
          <p className="mt-0.5 text-[10.5px] leading-4 text-ok">{state.message}</p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className={cell}>
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="field" value={spec!.name} />
      <input type="hidden" name="group" value={spec!.group} />

      <dt className={`label flex items-center gap-1.5 ${hideLabel ? "sr-only" : ""}`}>
        {label}
        <Lock className="h-2.5 w-2.5 text-ink-faint" aria-hidden />
        <span className="font-normal normal-case tracking-normal text-ink-faint">
          {spec!.group}
        </span>
      </dt>

      <div className="mt-0.5 flex items-center gap-1.5">
        {spec!.choices ? (
          <select
            ref={input as React.RefObject<HTMLSelectElement>}
            name="value"
            defaultValue={value ?? ""}
            className="focus-ring min-w-0 flex-1 rounded-lg border border-surface-rule
                       bg-surface px-2 py-1 text-[12.5px]"
          >
            {spec!.choices.map((c) => (
              <option key={c || "—"} value={c}>
                {c || "— none —"}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={input as React.RefObject<HTMLInputElement>}
            name="value"
            type={spec!.kind === "date" ? "date" : spec!.kind === "int" ? "number" : "text"}
            defaultValue={value ?? ""}
            placeholder={PLACEHOLDER[spec!.kind]}
            className="focus-ring min-w-0 flex-1 rounded-lg border border-surface-rule
                       bg-surface px-2 py-1 text-[12.5px]"
          />
        )}
        <button
          type="submit"
          disabled={pending}
          className="focus-ring rounded-lg bg-jci-navy p-1.5 text-white disabled:opacity-50"
          aria-label="Save"
          title="Save"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="focus-ring rounded-lg border border-surface-rule p-1.5 text-ink-faint"
          aria-label="Cancel"
          title="Cancel"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {state?.error && (
        <p className="mt-1 text-[10.5px] leading-4 text-risk">{state.error}</p>
      )}
      {pending && (
        <p className="mt-1 text-[10.5px] leading-4 text-ink-faint">
          Saving, then rebuilding every permission level&rsquo;s payload…
        </p>
      )}
    </form>
  );
}

const PLACEHOLDER: Record<string, string> = {
  date: "YYYY-MM-DD",
  mobile: "+852########",
  email: "name@example.com",
  member: "VJC-0000",
  int: "0",
  text: "",
};

/**
 * The same editor, sized for a table cell.
 *
 * The fee table is where the Finance Director's edit right actually lands:
 * HS + FD hold EDIT on the finance group, and finance has no column on the
 * member row -- fee_status_current is derived by derived.py from
 * fee_records for the current year. So "mark this year's fee paid" is a
 * write to that table, and this is the control for it. Offered on the
 * current year only, because a fee status for 2019 is history, not a
 * correction anyone makes from a member record.
 */
export function EditableCell({
  value,
  memberId,
  spec,
  tone,
}: {
  value: string;
  memberId: string;
  spec?: WritableField | null;
  tone?: string;
}) {
  const [state, action, pending] = useActionState<WriteState, FormData>(saveField, null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  if (!spec) {
    return (
      <span className="font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    );
  }

  if (!editing) {
    return (
      <span className="group/c inline-flex items-center gap-1">
        <span className="font-semibold" style={tone ? { color: tone } : undefined}>
          {value}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="focus-ring rounded p-0.5 opacity-0 transition-opacity
                     group-hover/c:opacity-100 focus:opacity-100"
          aria-label={`Edit ${spec.label}`}
          title={`Edit ${spec.label}`}
        >
          <Pencil className="h-3 w-3 text-ink-faint hover:text-jci-navy" aria-hidden />
        </button>
        {state?.error && <span className="text-[10px] text-risk">{state.error}</span>}
      </span>
    );
  }

  return (
    <form action={action} className="inline-flex items-center gap-1">
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="field" value={spec.name} />
      <input type="hidden" name="group" value={spec.group} />
      <select
        name="value"
        defaultValue={value}
        autoFocus
        className="focus-ring rounded border border-surface-rule bg-surface px-1 py-0.5 text-[11.5px]"
      >
        {(spec.choices ?? []).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="focus-ring rounded bg-jci-navy p-1 text-white disabled:opacity-50"
        aria-label="Save"
      >
        <Check className="h-3 w-3" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="focus-ring rounded border border-surface-rule p-1 text-ink-faint"
        aria-label="Cancel"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </form>
  );
}
