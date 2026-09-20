import { NextResponse } from "next/server";

import { record } from "@/lib/activity";
import { tryGetPayload } from "@/lib/data";

/**
 * Role-scoped CSV (PRD 6.7). The columns are whatever survived
 * permissions.apply() for this persona, so the export cannot contain a
 * field the exporter could not see on screen.
 */
export async function GET() {
  // A route handler is not behind the (app) layout that redirects, so it
  // carries its own guard. An unsigned request gets 401, not a stack trace.
  const payload = await tryGetPayload();
  if (!payload) {
    return new NextResponse("Sign in to export", { status: 401 });
  }

  if (!payload.access.pages.export) {
    return new NextResponse("Not available to your role", { status: 403 });
  }

  const rows = payload.members;
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const now = new Date().toISOString();

  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  // The watermark names an account, not a persona. A forwarded file now
  // says which member produced it and which of their roles let them.
  const header = [
    `# JCI Victoria - Member Growth Tracker`,
    `# Exported by: ${payload.viewer.name} <${payload.viewer.username}>`,
    `# Role record: ${payload.viewer.role_record}`,
    `# Access tier: ${payload.access.tier} (via ${payload.viewer.governing_role ?? "-"})`,
    `# Fields: ${cols.length} of ${payload.access.total_fields}`,
    `# Generated: ${now}`,
    `# Synthetic demo data - not real member records`,
  ].join("\n");

  const csv = [
    header,
    cols.join(","),
    ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(",")),
  ].join("\n");

  record({
    actor_name: payload.viewer.name,
    actor_role: payload.access.tier,
    action: "EXPORT",
    field_group: payload.access.visible_groups.join(", "),
    detail: `CSV export · ${rows.length} rows · ${cols.length} columns`,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jci-victoria-${payload.viewer.member_id}-${now.slice(0, 10)}.csv"`,
    },
  });
}
