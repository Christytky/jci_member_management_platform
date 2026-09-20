import { redirect } from "next/navigation";

import { Sidebar } from "@/components/Sidebar";
import { RoleBanner } from "@/components/RoleBanner";
import { getSession } from "@/lib/auth";
import { getPayloadFor } from "@/lib/data";

/**
 * The signed-in shell. One guard, at the root of every authenticated route.
 *
 * The session is read here in a server component, and the payload it picks
 * was filtered at build time by the tier that session's ROLE RECORD earns.
 * Nothing below this line can widen it -- the fields a tier may not see are
 * not in the file this layout just read.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const payload = await getPayloadFor(session);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar payload={payload} alertCount={payload.alerts.length} />
      <div className="flex min-w-0 flex-1 flex-col">
        <RoleBanner payload={payload} />
        <main className="flex-1 overflow-y-auto px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
