import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// Serif for the newspaper-style details and privacy pages.
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: "BayouBridge · Disaster-recovery casework",
  description:
    "BayouBridge reads a family's storm paperwork, finds recovery programs that might fit, and drafts what to send. In English and Spanish.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${geistSans.variable} ${newsreader.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
