import { Lock } from "lucide-react";

import { healthBand, severity, type HealthBand, type Severity } from "@/lib/theme";

export function PageHead({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

export function Kpi({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: number | string;
  note?: string;
  tone?: "default" | "warn" | "risk";
}) {
  const color =
    tone === "risk" ? "text-risk" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={`mt-1.5 text-kpi font-bold tnum ${color}`}>{value}</div>
      {note && <div className="mt-0.5 text-[11.5px] text-ink-faint">{note}</div>}
    </div>
  );
}

/**
 * PRD 13.2 rule: never colour alone. Every band carries an icon and its
 * text label as well as its colour, because one in twelve men is
 * colour-blind and a judge may be one of them.
 */
export function BandChip({ band }: { band: string }) {
  const b = healthBand[(band as HealthBand) ?? "N/A"] ?? healthBand["N/A"];
  return (
    <span className="chip" style={{ background: b.bg, color: b.color }}>
      <span aria-hidden>{b.icon}</span>
      {b.label}
    </span>
  );
}

export function SeverityChip({ level }: { level: string }) {
  const s = severity[(level as Severity) ?? "Watch"] ?? severity.Watch;
  return (
    <span className="chip" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

export function ClassChip({ value }: { value: string }) {
  const map: Record<string, string> = {
    PM: "bg-jci-blue/10 text-jci-navy",
    FM: "bg-jci-navy/10 text-jci-navy",
    SM: "bg-ink/[0.07] text-ink-muted",
  };
  return <span className={`chip ${map[value] ?? "bg-surface-sunken text-ink-muted"}`}>{value}</span>;
}

/**
 * PRD 13.4: a masked field is never an empty cell. An empty cell looks
 * like missing data; a lock looks like a policy.
 */
export function Masked({ value }: { value?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-ink-faint"
      title="Hidden by your access level"
    >
      <Lock className="h-3 w-3" aria-hidden />
      {value ?? "restricted"}
    </span>
  );
}

/** PRD 13.4: every table gets one. Blank panels are what make a demo look broken. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-surface-rule px-5 py-8 text-center text-[13px] text-ink-faint">
      {children}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 border-b border-surface-rule px-5 py-3.5">
          <div>
            {title && <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[11.5px] text-ink-faint">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      <div className="card-pad">{children}</div>
    </section>
  );
}

/** Shown where a whole page or panel is out of scope for the role. */
export function Restricted({ what }: { what: string }) {
  return (
    <div className="card card-pad flex items-center gap-3 text-[13px] text-ink-muted">
      <Lock className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      <span>
        <strong className="font-semibold text-ink">{what}</strong> is not available to your
        role. The data behind it was never loaded for this session — it is not hidden on
        screen, it is absent from the response.
      </span>
    </div>
  );
}
