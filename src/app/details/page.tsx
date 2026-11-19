import type { Metadata } from "next";
import { ARTICLE } from "@/components/details/article";
import Newspaper from "@/components/details/Newspaper";

export const metadata: Metadata = { title: "The details · BayouBridge" };

// Everything technical about BayouBridge, in one newspaper-style page.
export default function DetailsPage() {
  return <Newspaper article={ARTICLE} />;
}
