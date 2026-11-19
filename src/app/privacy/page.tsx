import type { Metadata } from "next";
import Newspaper from "@/components/details/Newspaper";
import { PRIVACY } from "@/components/details/privacy";

export const metadata: Metadata = { title: "Privacy policy · BayouBridge" };

// The privacy policy, in the same newspaper format as "The details".
export default function PrivacyPage() {
  return <Newspaper article={PRIVACY} />;
}
