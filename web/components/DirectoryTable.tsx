"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { BandChip, ClassChip, Empty } from "@/components/ui";
import type { Member } from "@/lib/data";

/**
 * PRD 6.4: searchable, filterable, and the columns shown depend on role --
 * a project leader's view has no fee column at all.
 *
 * This is a client component, so it receives data. That is safe precisely
 * because what it receives is the role's already-filtered payload: the
 * fields a Chairman may not see were dropped server-side and are not in
 * this props object to leak.
 */
export function DirectoryTable({
  members,
  showFinance,
  showHealth,
}: {
  members: Member[];
  showFinance: boolean;
  showHealth: boolean;
}) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("All");
  const [band, setBand] = useState("All");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members.filter((m) => {
      if (cls !== "All" && m.member_class !== cls) return false;
      if (showHealth && band !== "All" && (m.health_band ?? "N/A") !== band) return false;
      if (!needle) return true;
      return [m.full_name, m.member_id, m.company, m.job_title, m.industry]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [members, q, cls, band, showHealth]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, ID, company or industry"
            aria-label="Search members"
            className="focus-ring w-full rounded-xl border border-surface-rule bg-surface
                       py-2 pl-9 pr-3 text-[13px] placeholder:text-ink-faint"
          />
        </div>

        <Filter label="Class" value={cls} onChange={setCls} options={["All", "PM", "FM", "SM"]} />
        {showHealth && (
          <Filter
            label="Health"
            value={band}
            onChange={setBand}
            options={["All", "Healthy", "Watch", "At risk", "N/A"]}
          />
        )}
        <span className="ml-auto text-[12px] text-ink-faint tnum">
          {filtered.length} of {members.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Empty>No members match those filters.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-jci">
            <thead>
              <tr>
                <th>Member</th>
                <th className="w-[8%]">Class</th>
                <th className="w-[14%]">Status</th>
                <th className="w-[20%]">Company</th>
                {showFinance && <th className="w-[11%]">2026 fee</th>}
                {showHealth && <th className="w-[13%]">Health</th>}
                {!showFinance && !showHealth && <th className="w-[16%]">Contact</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((m) => (
                <tr key={m.member_id} className="transition-colors hover:bg-surface-sunken/60">
                  <td>
                    <Link
                      href={`/members/${m.member_id}`}
                      className="font-semibold text-ink hover:text-jci-navy hover:underline underline-offset-2"
                    >
                      {m.full_name}
                    </Link>
                    <div className="text-[11px] text-ink-faint tnum">
                      {m.member_id}
                      {m.board_post_2026 ? ` · ${m.board_post_2026}` : ""}
                    </div>
                  </td>
                  <td>
                    <ClassChip value={m.member_class} />
                  </td>
                  <td className="text-ink-muted">{m.member_status}</td>
                  <td className="truncate text-ink-muted" title={m.company ?? ""}>
                    {m.company ?? "—"}
                  </td>
                  {showFinance && (
                    <td>
                      <FeeCell value={m.fee_status_current} />
                    </td>
                  )}
                  {showHealth && (
                    <td>
                      {m.health_band === "N/A" ? (
                        <span className="text-[11.5px] text-ink-faint">not eligible</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <BandChip band={m.health_band ?? "N/A"} />
                          <span className="text-[12px] font-semibold tnum text-ink-muted">
                            {m.health_score ?? "—"}
                          </span>
                        </span>
                      )}
                    </td>
                  )}
                  {!showFinance && !showHealth && (
                    <td className="text-[12px] tnum text-ink-muted">{m.mobile ?? "—"}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <p className="border-t border-surface-rule px-3 py-2 text-[11.5px] text-ink-faint">
              Showing first 200 of {filtered.length}. Narrow the search to see more.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring cursor-pointer rounded-lg border border-surface-rule bg-surface
                   px-2.5 py-1.5 text-[12.5px] font-medium"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function FeeCell({ value }: { value?: string | null }) {
  const tone: Record<string, string> = {
    Paid: "bg-ok/10 text-ok",
    Waived: "bg-ok/10 text-ok",
    Pending: "bg-warn/10 text-warn",
    Unpaid: "bg-risk/10 text-risk",
  };
  if (!value) return <span className="text-ink-faint">—</span>;
  return <span className={`chip ${tone[value] ?? "bg-surface-sunken text-ink-muted"}`}>{value}</span>;
}
