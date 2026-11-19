import { claudeConfigured } from "@/lib/runDemo";

export const dynamic = "force-dynamic";

// GET /api/status: whether this server can read photos and PDFs (it has a Claude API key).
export function GET() {
  return Response.json({ claude: claudeConfigured() });
}
