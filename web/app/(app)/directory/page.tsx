import { DirectoryTable } from "@/components/DirectoryTable";
import { PageHead } from "@/components/ui";
import { getPayload } from "@/lib/data";

export default async function DirectoryPage() {
  const payload = await getPayload();
  const showFinance = payload.access.visible_groups.includes("finance");
  const showHealth = payload.members.some((m) => m.health_band !== undefined);

  const subtitle =
    payload.access.tier === "Member"
      ? "Your own record"
      : `${payload.members.length} members · ${payload.access.column_count} fields loaded for your role`;

  return (
    <>
      <PageHead title="Member directory" subtitle={subtitle} />
      <DirectoryTable
        members={payload.members}
        showFinance={showFinance}
        showHealth={showHealth}
      />
    </>
  );
}
