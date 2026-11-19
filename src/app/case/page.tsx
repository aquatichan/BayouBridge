import type { Metadata } from "next";
import CaseApp from "@/components/app/CaseApp";

export const metadata: Metadata = { title: "Your case · BayouBridge" };

// The household app. The landing page links here: ?start=1 opens at consent, ?sample=1 runs the sample case.
export default async function CasePage({ searchParams }: { searchParams: Promise<{ start?: string; sample?: string }> }) {
  const p = await searchParams;
  return <CaseApp start={p.sample ? "sample" : p.start ? "consent" : "welcome"} />;
}
