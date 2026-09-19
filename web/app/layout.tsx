import type { Metadata } from "next";

import { Sidebar } from "@/components/Sidebar";
import { RoleBanner } from "@/components/RoleBanner";
import { currentPersonaKey, getPayload, listPersonas } from "@/lib/data";

import "./globals.css";

// PRD 13.1: Plus Jakarta Sans is JCI's official primary typeface.
//
// Loaded as a stylesheet link rather than via next/font on purpose. next/font
// downloads the file during `next build`, so a blocked or slow fonts.googleapis
// .com turns a font into a failed deployment. This way the build never touches
// the network and a font that does not load degrades to the system sans stack.

export const metadata: Metadata = {
  title: "JCI Victoria — Member Growth Tracker",
  description:
    "One live member record, a full movement history, and access granted by post rather than by sharing a file.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read once here, in a server component. The payload for this persona was
  // filtered at build time; nothing below this line can widen it.
  const [payload, personas, current] = await Promise.all([
    getPayload(),
    listPersonas(),
    currentPersonaKey(),
  ]);

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="flex h-screen overflow-hidden">
          <Sidebar
            payload={payload}
            personas={personas}
            current={current}
            alertCount={payload.alerts.length}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <RoleBanner payload={payload} />
            <main className="flex-1 overflow-y-auto px-8 py-7">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
