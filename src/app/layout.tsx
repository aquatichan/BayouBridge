import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// One serif italic accent word per headline on the landing page.
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: "italic" });

export const metadata: Metadata = {
  title: "BayouBridge · Disaster-recovery casework",
  description:
    "BayouBridge turns a storm-affected household's photos, letters and voice notes into organized evidence, matched recovery pathways and a tracked plan.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
