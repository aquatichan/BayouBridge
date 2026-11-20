import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// Serif for accent words, kickers and the newspaper-style details page.
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: "BayouBridge · Disaster-recovery casework",
  description:
    "BayouBridge turns a storm-affected household's photos, letters and voice notes into organized evidence, matched recovery pathways and a tracked plan.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${geistSans.variable} ${newsreader.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
