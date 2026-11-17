import Dashboard from "@/components/Dashboard";
import { DEMO_TODAY, documents, household } from "@/data/household";

export default function Home() {
  return <Dashboard household={household} documents={documents} today={DEMO_TODAY} />;
}
