import { NextResponse } from "next/server";

import { record } from "@/lib/activity";
import { getPayload } from "@/lib/data";

/**
 * Role-scoped CSV (PRD 6.7). The columns are whatever survived
 * permissions.apply() for this persona, so the export cannot contain a
 * field the exporter could not see on screen.
 */
export async function GET() {
  const payload = await getPayload();

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

  const header = [
    `# JCI Victoria - Member Growth Tracker`,
    `# Exported by: ${payload.persona.name}`,
    `# Role: ${payload.persona.role}`,
    `# Fields: ${cols.length} of 53`,
    `# Generated: ${now}`,
    `# Synthetic demo data - not real member records`,
  ].join("\n");

  const csv = [
    header,
    cols.join(","),
    ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(",")),
  ].join("\n");

  record({
    actor_name: payload.persona.name,
    actor_role: payload.persona.role,
    action: "EXPORT",
    field_group: payload.access.visible_groups.join(", "),
    detail: `CSV export · ${rows.length} rows · ${cols.length} columns`,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jci-victoria-${payload.persona.key}-${now.slice(0, 10)}.csv"`,
    },
  });
}
