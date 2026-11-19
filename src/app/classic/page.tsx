import Dashboard from "@/components/Dashboard";
import { DEMO_TODAY, documents, followUpDocuments, household } from "@/data/household";

export default function Classic() {
  return <Dashboard household={household} documents={documents} followUps={followUpDocuments} today={DEMO_TODAY} />;
}
