import Dashboard from "@/components/Dashboard";
import { DEMO_TODAY, documents, followUpDocuments, household } from "@/data/household";

export default function Home() {
  return <Dashboard household={household} documents={documents} followUps={followUpDocuments} today={DEMO_TODAY} />;
}
