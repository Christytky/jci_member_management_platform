import { DirectoryTable } from "@/components/DirectoryTable";
import { AddMemberPanel } from "@/components/RecordAdmin";
import { PageHead } from "@/components/ui";
import { getPayload } from "@/lib/data";

export default async function DirectoryPage() {
  const payload = await getPayload();
  const showFinance = payload.access.visible_groups.includes("finance");
  const showHealth = payload.members.some((m) => m.health_band !== undefined);

  const subtitle =
    payload.access.tier === "Member"
      ? "Your own record"
      : `${payload.members.length} members · ${payload.access.column_count} fields loaded at your permission level`;

  return (
    <>
      <PageHead
        title="Member directory"
        subtitle={subtitle}
        // Only the permission level that owns the member database gets this,
        // and it is collapsed to a single button until it is wanted.
        right={
          payload.access.can_create ? (
            <AddMemberPanel fields={payload.access.writable_fields} />
          ) : undefined
        }
      />
      <DirectoryTable
        members={payload.members}
        showFinance={showFinance}
        showHealth={showHealth}
      />
    </>
  );
}
