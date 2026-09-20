import type { Metadata } from "next";

import "./globals.css";

// PRD 13.1: Plus Jakarta Sans is JCI's official primary typeface.
//
// Loaded as a stylesheet link rather than via next/font on purpose. next/font
// downloads the file during `next build`, so a blocked or slow fonts.googleapis
// .com turns a font into a failed deployment. This way the build never touches
// the network and a font that does not load degrades to the system sans stack.

export const metadata: Metadata = {
  title: "JCI Victoria — Smart Member Management Platform",
  description:
    "One live member record, a full movement history, and access granted by post rather than by sharing a file.",
};

/**
 * The root layout holds the document and nothing else.
 *
 * Everything that assumes a signed-in user -- the sidebar, the access
 * banner, the payload itself -- lives in app/(app)/layout.tsx, which reads
 * the session and redirects when there is none. /login therefore renders
 * with no chance of a guard being skipped, because the shell it would have
 * to skip is not in its tree.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
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
      <body>{children}</body>
    </html>
  );
}
