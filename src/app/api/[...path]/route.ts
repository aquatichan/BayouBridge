import { POST as approve } from "@/server/api/approve";
import { DELETE as deleteCase, GET as getCase } from "@/server/api/case";
import { POST as createCase } from "@/server/api/cases";
import { POST as addDocuments } from "@/server/api/documents";
import { GET as outbox } from "@/server/api/outbox";
import { POST as resolve } from "@/server/api/resolve";
import { POST as run } from "@/server/api/run";
import { POST as stream } from "@/server/api/stream";
import { GET as status } from "@/server/api/status";

// Every API endpoint goes through this one route on purpose. Cases live in
// server memory (src/lib/store.ts), and on Vercel route files can land in
// separate functions with separate memory: a case created by /api/cases was missing
// when /api/run/stream looked for it ("This case has expired"). One route file
// means one function, so all requests share the same store.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Documents are read in parallel, so a run with Claude takes at most about 45 s
// (the per-document limit in cases.ts). 120 leaves room for a slow cold start.
export const maxDuration = 120;

type Ctx = { params: Promise<{ path: string[] }> };
type Handler = (req: Request, id: string) => Promise<Response> | Response;

const ROUTES: { method: string; match: RegExp; run: Handler }[] = [
  { method: "GET", match: /^status$/, run: () => status() },
  { method: "POST", match: /^cases$/, run: (req) => createCase(req) },
  { method: "GET", match: /^cases\/([^/]+)$/, run: (req, id) => getCase(req, { params: Promise.resolve({ id }) }) },
  { method: "DELETE", match: /^cases\/([^/]+)$/, run: (req, id) => deleteCase(req, { params: Promise.resolve({ id }) }) },
  { method: "POST", match: /^cases\/([^/]+)\/documents$/, run: (req, id) => addDocuments(req, { params: Promise.resolve({ id }) }) },
  { method: "POST", match: /^run$/, run: (req) => run(req) },
  { method: "POST", match: /^run\/stream$/, run: (req) => stream(req) },
  { method: "POST", match: /^approve$/, run: (req) => approve(req) },
  { method: "POST", match: /^resolve$/, run: (req) => resolve(req) },
  { method: "GET", match: /^outbox$/, run: (req) => outbox(req) },
];

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const path = (await ctx.params).path.map(decodeURIComponent).join("/");
  const hits = ROUTES.filter((r) => r.match.test(path));
  if (!hits.length) return Response.json({ error: "Not found" }, { status: 404 });
  const route = hits.find((r) => r.method === req.method);
  if (!route) return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: hits.map((r) => r.method).join(", ") } });
  return route.run(req, path.match(route.match)?.[1] ?? "");
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
