"use client";

import { useTransition } from "react";
import { ChevronDown } from "lucide-react";

import { switchPersona } from "@/app/actions";
import type { PersonaSummary } from "@/lib/data";

/**
 * The role switcher (PRD 6.1). Always visible, and the single most
 * important control in the demo -- rehearse this until it takes twenty
 * seconds.
 *
 * Note what this component does NOT receive: any member data. It gets the
 * persona list and nothing else. Switching sets a cookie and the server
 * re-renders from a different pre-filtered payload.
 */
export function RoleSwitcher({
  personas,
  current,
}: {
  personas: PersonaSummary[];
  current: string;
}) {
  const [pending, start] = useTransition();
  const active = personas.find((p) => p.key === current);

  return (
    <div className="px-3 pb-3">
      <label className="label mb-1.5 block px-1">Viewing as</label>
      <div className="relative">
        <select
          value={current}
          disabled={pending}
          onChange={(e) => {
            const key = e.target.value;
            start(() => {
              void switchPersona(key);
            });
          }}
          aria-label="Switch demo persona"
          className="focus-ring w-full cursor-pointer appearance-none rounded-xl border
                     border-surface-rule bg-surface py-2.5 pl-3 pr-9 text-[13px]
                     font-semibold text-ink disabled:opacity-60"
        >
          {personas.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
      </div>
      {active && (
        <p className="mt-1.5 px-1 text-[11px] leading-4 text-ink-faint tnum">
          {active.post} · {active.role} · {active.columns} of 53 fields · {active.members}{" "}
          {active.members === 1 ? "record" : "records"}
        </p>
      )}
    </div>
  );
}
