import { NextResponse } from "next/server";

import { record } from "@/lib/activity";
import { tryGetPayload } from "@/lib/data";
import { levelLabel, postLabel, summarisePosts } from "@/lib/posts";

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
    return new NextResponse("Not available at your permission level", { status: 403 });
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
  // says which member produced it and which post let them -- in words, so
  // the person who receives the file does not need the code list to read it.
  const posts = summarisePosts(payload.viewer.roles);
  const header = [
    `# JCI Victoria - Smart Member Management Platform`,
    `# Exported by: ${payload.viewer.name} <${payload.viewer.username}>`,
    `# Post: ${posts.full}`,
    `# Permission level: ${levelLabel(payload.access.tier)}` +
      (payload.viewer.governing_role
        ? ` · earned by ${postLabel(payload.viewer.governing_role)}, the highest post held`
        : ""),
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
