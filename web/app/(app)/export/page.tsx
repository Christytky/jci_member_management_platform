import { Download } from "lucide-react";

import { Card, PageHead, Restricted } from "@/components/ui";
import { getPayload } from "@/lib/data";

/**
 * PRD 6.7. The answer to "people download the sheet and forward it": the
 * export carries only the columns this role may see, is watermarked with
 * who produced it, and writes an EXPORT row to the activity log.
 */
export default async function ExportPage() {
  const payload = await getPayload();

  if (!payload.access.pages.export) {
    return (
      <>
        <PageHead title="Export" subtitle="Role-scoped CSV" />
        <Restricted what="CSV export" />
      </>
    );
  }

  const cols = payload.access.column_count;

  return (
    <>
      <PageHead
        title="Export"
        subtitle="A CSV of exactly the columns your role may see — watermarked and logged"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card title="What you will get">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
            <div>
              <dt className="label">Rows</dt>
              <dd className="mt-1 text-[22px] font-bold tnum">{payload.members.length}</dd>
            </div>
            <div>
              <dt className="label">Columns</dt>
              <dd className="mt-1 text-[22px] font-bold tnum">{cols}</dd>
            </div>
            <div className="col-span-2">
              <dt className="label">Field groups included</dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {payload.access.visible_groups.map((g) => (
                  <span key={g} className="chip bg-ok/10 text-ok">
                    {g}
                  </span>
                ))}
                {payload.access.hidden_groups.map((g) => (
                  <span key={g} className="chip bg-surface-sunken text-ink-faint line-through">
                    {g}
                  </span>
                ))}
              </dd>
            </div>
          </dl>

          <a
            href="/api/export"
            className="focus-ring mt-5 inline-flex items-center gap-2 rounded-xl bg-jci-blue px-4 py-2.5
                       text-[13px] font-semibold text-white transition-colors hover:bg-jci-navy"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download CSV
          </a>
        </Card>

        <Card title="Watermark" subtitle="Written into the file header">
          <pre className="overflow-x-auto rounded-lg bg-surface-sunken p-3 text-[11px] leading-5 tnum text-ink-muted">
{`# JCI Victoria — Smart Member Management Platform
# Exported by: ${payload.viewer.name} <${payload.viewer.username}>
# Role record: ${payload.viewer.role_record}
# Access tier: ${payload.access.tier}
# Fields: ${cols} of ${payload.access.total_fields}
# Generated: <timestamp>
# Synthetic demo data`}
          </pre>
          <p className="mt-3 text-[11.5px] leading-5 text-ink-muted">
            A forwarded file still says who produced it, and the download itself appears in
            the activity log.
          </p>
        </Card>
      </div>
    </>
  );
}
