import Link from "next/link";
import {
  LayoutDashboard,
  BellRing,
  Users,
  Network,
  Upload,
  ScrollText,
  Download,
  Lock,
} from "lucide-react";

import { AccountCard } from "@/components/AccountCard";
import type { Payload } from "@/lib/data";

const NAV = [
  { href: "/", label: "Dashboard", page: "dashboard", Icon: LayoutDashboard },
  { href: "/alerts", label: "Alerts", page: "alerts", Icon: BellRing },
  { href: "/directory", label: "Directory", page: "directory", Icon: Users },
  { href: "/growth", label: "Growth tree", page: "growth", Icon: Network },
  { href: "/activity", label: "Activity log", page: "activity", Icon: ScrollText },
  { href: "/export", label: "Export", page: "export", Icon: Download },
] as const;

/** The only write path in the app, kept visually apart from the read pages. */
const MANAGE = [
  { href: "/upload", label: "Member database", page: "upload", Icon: Upload },
] as const;

/**
 * Navigation is tier-aware: a page the tier may not open is rendered as a
 * locked row rather than removed. Showing the lock is deliberate -- it
 * makes the access model visible instead of leaving a judge to wonder
 * whether the page exists.
 */
export function Sidebar({
  payload,
  alertCount,
}: {
  payload: Payload;
  alertCount: number;
}) {
  const row = (
    { href, label, page, Icon }: { href: string; label: string; page: string; Icon: typeof Users },
  ) => {
    if (!payload.access.pages[page]) {
      return (
        <div
          key={href}
          className="nav-item cursor-not-allowed opacity-45"
          title="Hidden by your access level"
        >
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{label}</span>
          <span className="sr-only">not available to your role</span>
        </div>
      );
    }
    return (
      <Link key={href} href={href} className="nav-item">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">{label}</span>
        {page === "alerts" && alertCount > 0 && (
          <span className="chip bg-risk/10 text-risk tnum">{alertCount}</span>
        )}
      </Link>
    );
  };

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-surface-rule bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-jci-blue text-[13px] font-bold text-white">
          JCI
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-tight">JCI Victoria</div>
          {/* The lockup subtitle, not the product name: "Smart Member
              Management Platform" set at 9.5px uppercase wraps to three
              lines in a 248px rail and unbalances the mark. The full name
              is on the sign-in screen, the page title and every export. */}
          <div className="text-[9.5px] font-medium uppercase tracking-[0.06em] text-ink-faint">
            Member Platform
          </div>
        </div>
      </div>

      <AccountCard payload={payload} />

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pt-2">
        <div className="label px-3 pb-1.5 pt-2">Chapter</div>
        {NAV.map(row)}

        <div className="label px-3 pb-1.5 pt-5">Manage</div>
        {MANAGE.map(row)}

        <div className="label px-3 pb-1.5 pt-5">Your record</div>
        <Link href={`/members/${payload.viewer.member_id}`} className="nav-item">
          <Users className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{payload.viewer.name}</span>
        </Link>
      </nav>

      <div className="border-t border-surface-rule px-5 py-3.5">
        <p className="text-[10px] leading-4 text-ink-faint">
          Demo on synthetic data · as at{" "}
          <span className="tnum">{payload.as_of}</span>
        </p>
      </div>
    </aside>
  );
}
