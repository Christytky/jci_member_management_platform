import { History, ShieldCheck } from "lucide-react";

import { UploadPanel } from "@/components/UploadPanel";
import { Card, Empty, PageHead, Restricted } from "@/components/ui";
import { listStaged } from "@/lib/admin";
import { getPayload } from "@/lib/data";

export const metadata = { title: "Member database — JCI Victoria" };

/**
 * The only write path in the app.
 *
 * "P roles and MA Teams can upload and update member databases" -- so the
 * President + MA tier, and nobody else. Note what decides that: not a flag
 * on an account, but the tier the account's ROLE RECORD earns. An MAO whose
 * record reads "MAO & FM" reaches this page; a Vice President whose record
 * reads "BOD & VP & FM" does not, and neither can be granted the page
 * without changing the post they hold.
 */
export default async function UploadPage() {
  const payload = await getPayload();

  if (!payload.access.pages.upload || !payload.access.can_write) {
    return (
      <>
        <PageHead title="Member database" subtitle="Upload and replace chapter records" />
        <Restricted what="Updating the member database" />
        <p className="mt-4 text-[13px] leading-5 text-ink-muted">
          The member database is maintained by the President and the MA team. Your role
          record is{" "}
          <strong className="font-semibold text-ink">{payload.viewer.role_record}</strong>,
          which places you on the {payload.access.tier} tier.
        </p>
      </>
    );
  }

  const staged = await listStaged();

  return (
    <>
      <PageHead
        title="Member database"
        subtitle="Upload the chapter workbook, check it, then replace the records"
        right={
          <span className="flex items-center gap-1.5 rounded-xl border border-surface-rule bg-surface px-3.5 py-2 text-[11.5px] font-semibold text-jci-navy">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            <span className="tnum">{payload.members.length}</span> members loaded · as at{" "}
            <span className="tnum">{payload.as_of}</span>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Upload a workbook" subtitle="Nothing changes until you apply it">
          <UploadPanel canWrite={payload.access.can_write} />
        </Card>

        <div className="space-y-5">
          <Card title="What applying does">
            <ol className="space-y-3 text-[12px] leading-5 text-ink-muted">
              <li>
                <span className="label block">1 · Load</span>
                Reads the five sheets into the database, regenerating mobiles and personal
                emails as synthetic values.
              </li>
              <li>
                <span className="label block">2 · Derive</span>
                Recomputes every derived field — ages, FM deadlines, health scores — and
                resolves each member&apos;s role record to a permission tier.
              </li>
              <li>
                <span className="label block">3 · Rebuild</span>
                Writes a fresh payload per tier, and one per member on the Member tier.
                This is the step that keeps the access rules from going stale: a tier is
                served a file holding only the fields it may see.
              </li>
            </ol>
          </Card>

          <Card
            title="Previously staged"
            subtitle="Kept on disk, never deleted by this page"
            right={<History className="h-3.5 w-3.5 text-ink-faint" aria-hidden />}
          >
            {staged.length === 0 ? (
              <Empty>No workbook has been uploaded yet.</Empty>
            ) : (
              <ul className="-my-1 divide-y divide-surface-rule/70">
                {staged.slice(0, 8).map((f) => (
                  <li key={f.name} className="py-2.5">
                    <div className="truncate text-[12px] font-semibold tnum">{f.name}</div>
                    <div className="text-[11px] text-ink-faint tnum">
                      {(f.size / 1024).toFixed(0)} KB · {f.uploaded_at.slice(0, 16).replace("T", " ")}{" "}
                      · by {f.uploaded_by}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
