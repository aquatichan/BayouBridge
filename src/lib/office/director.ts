import type { ActivityEvent, TaskUpdate } from "@/lib/types";

// The office director turns agent tasks and activity events into walk-and-work
// jobs for the five mascots, moves them around the office, and decides which
// one the camera follows (the one working hardest). Pure TypeScript with no
// three.js, so it is testable and the 3D scene only reads it every frame.

export type MascotId = "coordinator" | "evidence" | "llm" | "recovery" | "approval";
export type StationId =
  | "inbox" | "reading" | "lab" | "records" | "board" | "desk" | "graph"
  | "library" | "phone" | "packets" | "gate" | "outbox";

export interface Vec2 { x: number; z: number }

export interface MascotDef {
  id: MascotId;
  name: string;
  role: string;
  file: string;
  color: string;
  home: StationId;
}

/** The five mascots cover all six agent roles (see agentToMascot). */
export const MASCOTS: MascotDef[] = [
  { id: "coordinator", name: "Organizer", role: "Keeps the case moving and writes the plan", file: "/models/coordinator.glb", color: "#0f4c4a", home: "desk" },
  { id: "evidence", name: "Paper Reader", role: "Reads your papers and checks the details", file: "/models/evidence.glb", color: "#4f7d4d", home: "reading" },
  { id: "llm", name: "AI Reader", role: "Reads photos and letters with AI", file: "/models/llm-extraction.glb", color: "#6b4f8a", home: "lab" },
  { id: "recovery", name: "Help Finder", role: "Finds help you may qualify for and asks what's missing", file: "/models/recovery.glb", color: "#2f5d8a", home: "library" },
  { id: "approval", name: "Gatekeeper", role: "Prepares drafts and holds them until you say OK", file: "/models/approval-gates.glb", color: "#b8462f", home: "gate" },
];

export const mascotDef = (id: MascotId) => MASCOTS.find((m) => m.id === id)!;

export interface Station {
  name: string;
  /** Where a mascot stands to work here. All spots sit on an inner ring, so straight walks between them stay clear of the desks. */
  spot: Vec2;
  /** Which way a mascot faces while working here (radians, 0 = +z). */
  facing: number;
}

const ring = (deg: number, r = 7.2): Vec2 => ({ x: Math.sin((deg * Math.PI) / 180) * r, z: -Math.cos((deg * Math.PI) / 180) * r });
const station = (name: string, deg: number): Station => {
  const spot = ring(deg);
  return { name, spot, facing: Math.atan2(spot.x, spot.z) }; // face outward, toward the desk
};

/** The office: desks on a ring around an open floor. The camera looks in from +z. */
export const STATIONS: Record<StationId, Station> = {
  desk: station("Planning desk", 0),
  graph: station("Case map", 28),
  board: station("Case board", 56),
  library: station("Help library", 84),
  phone: station("Phone", 112),
  packets: station("Drafts table", 140),
  gate: station("Your OK gate", 168),
  outbox: station("Practice outbox", 196),
  lab: station("AI reading desk", 236),
  reading: station("Reading desk", 268),
  inbox: station("Mail tray", 300),
  records: station("Records", 332),
};

/** Which mascot does each agent's work. */
export function agentToMascot(agent: TaskUpdate["agent"]): MascotId {
  switch (agent) {
    case "Coordinator": return "coordinator";
    case "Evidence Agent": return "evidence";
    case "Recovery-Match Agent":
    case "Follow-up Agent": return "recovery";
    case "Packet Agent":
    case "Safety Agent": return "approval";
  }
}

const TASK_ROUTES: Record<string, [MascotId, StationId]> = {
  occupancy: ["evidence", "records"],
  people: ["evidence", "records"],
  needs: ["coordinator", "board"],
  conflicts: ["evidence", "board"],
  match: ["recovery", "library"],
  gaps: ["recovery", "phone"],
  plan: ["coordinator", "desk"],
  packet: ["approval", "packets"],
  safety: ["approval", "gate"],
  graph: ["coordinator", "graph"],
};

/** Where a task's work happens, and who does it. Reused readings need no one. */
export function routeTask(t: Pick<TaskUpdate, "id" | "agent" | "via">): [MascotId, StationId] | undefined {
  if (t.id.startsWith("extract:")) {
    if (t.via === "reused") return undefined;
    return t.via === "claude" ? ["llm", "lab"] : ["evidence", "reading"];
  }
  const mascot = agentToMascot(t.agent);
  return TASK_ROUTES[t.id] ?? [mascot, mascotDef(mascot).home];
}

/** Activity events mapped to the task they finish (used when no live task updates arrive, e.g. the replay fallback). */
function routeEvent(e: ActivityEvent): { key: string; mascot: MascotId; station: StationId; label: string } | undefined {
  const a = e.action;
  if (a === "Started case run") return { key: "start", mascot: "coordinator", station: "inbox", label: "Sorting the new papers" };
  if (a.startsWith("Read ")) {
    const claude = e.detail.includes("(claude");
    return { key: `extract:${e.refs?.[0] ?? a}`, mascot: claude ? "llm" : "evidence", station: claude ? "lab" : "reading", label: `Reading ${a.slice(5)}` };
  }
  if (a === "Fell back to rules") return { key: `extract:${e.refs?.[0] ?? a}`, mascot: "evidence", station: "reading", label: "Taking over this paper" };
  if (a === "Verified proof of occupancy" || a === "Occupancy not verified") return { key: "occupancy", mascot: "evidence", station: "records", label: "Checking the bill's address and dates" };
  const table: [string, string, MascotId, StationId, string][] = [
    ["Resolved people", "people", "evidence", "records", "Working out who's who"],
    ["Built needs list", "needs", "coordinator", "board", "Listing what the family needs"],
    ["Checked for conflicts", "conflicts", "evidence", "board", "Looking for details that don't match"],
    ["Matched recovery pathways", "match", "recovery", "library", "Finding help that fits"],
    ["Scored evidence", "gaps", "recovery", "phone", "Picking the next question"],
    ["Built recovery plan", "plan", "coordinator", "desk", "Writing the plan"],
    ["Applied approval gates", "safety", "approval", "gate", "Holding drafts for your OK"],
    ["Updated recovery graph", "graph", "coordinator", "graph", "Updating the case map"],
    ["Approval recorded", "approve", "approval", "gate", "Opening the gate"],
    ["Queued to sandbox outbox", "outbox", "approval", "outbox", "Putting the draft in the practice outbox"],
  ];
  const hit = table.find(([action]) => a === action);
  if (hit) return { key: hit[1], mascot: hit[2], station: hit[3], label: hit[4] };
  if (a.startsWith("Drafted packet for ")) return { key: `packet:${a}`, mascot: "approval", station: "packets", label: a.replace("Drafted packet for", "Drafting papers for") };
  return undefined;
}

export interface Job {
  key: string;
  station: StationId;
  label: string;
  /** The real task finished (or the job came from a finished event). */
  done: boolean;
  /** Minimum time spent working at the station, so instant rules-mode tasks are still visible. */
  minMs: number;
  workStart?: number;
}

export interface MascotState {
  id: MascotId;
  pos: Vec2;
  heading: number;
  speed: number;
  phase: "idle" | "walking" | "working";
  job?: Job;
  queue: Job[];
  idleSince: number;
  /** When jobs started, for the "working hardest" score. */
  starts: number[];
}

export interface OfficeSnapshot {
  follow: MascotId | null;
  mascots: {
    id: MascotId;
    phase: MascotState["phase"];
    label?: string;
    station?: string;
    destination?: StationId;
    queued: number;
    score: number;
  }[];
  /** Documents waiting in the inbox, for the paper stack. */
  inbox: number;
  /** The approval gate is open (an approval is being recorded). */
  gateOpen: boolean;
}

export const WALK_SPEED = 2.6; // units per second at normal pace
const WORK_MS = 650;
const HOME_AFTER_MS = 1600;
const RECENT_MS = 6000;
/** With `ambient` on: how long a helper stands at home before finding something to do, and how long it does it. */
const AMBIENT_AFTER_MS = 1800;
const AMBIENT_WORK_MS = 2600;

/** Small, real-sounding background work for each helper, so the office never stands still. */
const AMBIENT: Record<MascotId, [StationId, string][]> = {
  coordinator: [["board", "Reviewing the case board"], ["desk", "Updating the plan"], ["graph", "Tidying the case map"]],
  evidence: [["records", "Filing papers"], ["inbox", "Checking the mail tray"], ["reading", "Re-reading a letter"]],
  llm: [["lab", "Double-checking quotes"], ["reading", "Comparing notes"], ["lab", "Checking every quote is in the document"]],
  recovery: [["library", "Checking program rules"], ["phone", "Looking up deadlines"], ["library", "Reading the FEMA appeal rules"]],
  approval: [["packets", "Proofreading drafts"], ["outbox", "Checking the practice outbox"], ["gate", "Guarding the gate"]],
};

export class OfficeDirector {
  mascots: Record<MascotId, MascotState>;
  follow: MascotId | null = null;
  private followSince = 0;
  private quietSince = 0;
  private keys = new Map<string, MascotId>(); // job key → mascot, for this run
  private listeners = new Set<() => void>();
  private snap: OfficeSnapshot;
  private snapKey = "";
  inbox = 0;
  /** Keep idle helpers busy with background work (the app turns this on; tests leave it off). */
  ambient = false;
  private ambientTurn = 0;

  constructor(now = 0) {
    this.mascots = Object.fromEntries(MASCOTS.map((m): [MascotId, MascotState] => {
      const s = STATIONS[m.home];
      return [m.id, { id: m.id, pos: { ...this.slot(m.home, m.id, s) }, heading: s.facing, speed: 0, phase: "idle", queue: [], idleSince: now, starts: [] }];
    })) as Record<MascotId, MascotState>;
    this.snap = this.buildSnapshot(now);
  }

  /** Where a mascot stands at a station: the owner at the spot, visitors beside it. */
  slot(stationId: StationId, mascot: MascotId, s = STATIONS[stationId]): Vec2 {
    const owner = MASCOTS.find((m) => m.home === stationId)?.id;
    if (owner === mascot) return s.spot;
    const i = MASCOTS.findIndex((m) => m.id === mascot);
    const side = i % 2 === 0 ? 1 : -1;
    // step sideways along the ring (perpendicular to the facing direction)
    return { x: s.spot.x + Math.cos(s.facing) * 1.7 * side, z: s.spot.z - Math.sin(s.facing) * 1.7 * side };
  }

  /** Start of a new run: forget which tasks have jobs, set the inbox pile. */
  newRun(documents: number) {
    this.keys.clear();
    this.inbox = documents;
    this.emit(performance.now());
  }

  private find(key: string): { m: MascotState; job: Job } | undefined {
    for (const m of Object.values(this.mascots)) {
      if (m.job?.key === key) return { m, job: m.job };
      const job = m.queue.find((j) => j.key === key);
      if (job) return { m, job };
    }
    return undefined;
  }

  addJob(mascot: MascotId, job: Omit<Job, "workStart">, now = performance.now()) {
    const m = this.mascots[mascot];
    // Coming home and background work are only fillers: drop them for real work.
    if (m.job?.key === "home" || m.job?.key.startsWith("ambient:")) m.job = undefined;
    m.queue.push({ ...job });
    m.starts.push(now);
    this.keys.set(job.key, mascot);
  }

  private remove(key: string) {
    for (const m of Object.values(this.mascots)) {
      if (m.job?.key === key) m.job = undefined;
      m.queue = m.queue.filter((j) => j.key !== key);
    }
  }

  onTask(t: TaskUpdate, now = performance.now()) {
    if (t.status === "started") {
      const route = routeTask(t);
      if (!route) return;
      const [mascot, stationId] = route;
      const existing = this.keys.get(t.id);
      if (existing === mascot) return;
      if (existing) this.remove(t.id); // e.g. Claude fell back: Evidence takes the document over
      this.addJob(mascot, { key: t.id, station: stationId, label: t.label, done: false, minMs: WORK_MS }, now);
    } else {
      const hit = this.find(t.id);
      if (hit) hit.job.done = true;
      if (t.id.startsWith("extract:") && this.inbox > 0) this.inbox--;
    }
    this.emit(now);
  }

  onEvent(e: ActivityEvent, now = performance.now()) {
    const r = routeEvent(e);
    if (!r) return;
    const hit = this.find(r.key);
    if (hit) {
      hit.job.done = true; // a live task already brought someone here; the event finishes it
    } else if (!this.keys.has(r.key) || this.keys.get(r.key) !== r.mascot) {
      if (this.keys.has(r.key)) this.remove(r.key);
      this.addJob(r.mascot, { key: r.key, station: r.station, label: r.label, done: true, minMs: WORK_MS }, now);
      if (r.key.startsWith("extract:") && e.action.startsWith("Read ") && this.inbox > 0) this.inbox--;
    }
    this.emit(now);
  }

  /** Advance every mascot by dt seconds. Called once per rendered frame. */
  tick(dt: number, now: number) {
    for (const m of Object.values(this.mascots)) {
      if (!m.job && m.queue.length) m.job = m.queue.shift();
      const home = mascotDef(m.id).home;
      if (!m.job) {
        const homeSpot = this.slot(home, m.id);
        const away = Math.hypot(m.pos.x - homeSpot.x, m.pos.z - homeSpot.z) > 0.05;
        if (away && now - m.idleSince > HOME_AFTER_MS) m.job = { key: "home", station: home, label: `Back to the ${STATIONS[home].name.toLowerCase()}`, done: true, minMs: 0 };
        else if (this.ambient && !away && now - m.idleSince > AMBIENT_AFTER_MS + MASCOTS.findIndex((x) => x.id === m.id) * 450) {
          const list = AMBIENT[m.id];
          const [station, label] = list[this.ambientTurn++ % list.length];
          m.job = { key: `ambient:${m.id}`, station, label, done: true, minMs: AMBIENT_WORK_MS };
        }
      }
      const job = m.job;
      if (!job) {
        m.phase = "idle"; m.speed = 0;
        m.heading = Math.atan2(-m.pos.x, 4 - m.pos.z); // idle: turn toward the room (and the camera)
        continue;
      }
      const dest = this.slot(job.station, m.id);
      const dx = dest.x - m.pos.x, dz = dest.z - m.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.04) {
        // Hurry when work piles up, so the office keeps pace with fast runs.
        m.speed = WALK_SPEED * Math.min(3.2, 1 + 0.55 * m.queue.length);
        const step = Math.min(d, m.speed * dt);
        m.pos = { x: m.pos.x + (dx / d) * step, z: m.pos.z + (dz / d) * step };
        m.heading = Math.atan2(dx, dz);
        m.phase = "walking";
        continue;
      }
      m.pos = { ...dest };
      m.speed = 0;
      m.heading = STATIONS[job.station].facing;
      if (job.key === "home") { m.job = undefined; m.phase = "idle"; m.idleSince = now; continue; }
      m.phase = "working";
      job.workStart ??= now;
      if (job.done && now - job.workStart >= job.minMs) {
        m.job = undefined;
        m.idleSince = now;
        m.phase = m.queue.length ? "walking" : "idle";
      }
    }
    this.updateFollow(now);
    this.emit(now);
  }

  /** How busy a mascot is: current work, what is queued, and how much it started recently. */
  score(m: MascotState, now: number): number {
    m.starts = m.starts.filter((t) => now - t < RECENT_MS);
    const active = m.job && m.job.key !== "home" ? 2 : 0;
    return active + m.queue.length + m.starts.length * 0.5;
  }

  /** Follow the hardest-working mascot, without flicking between two close ones. */
  private updateFollow(now: number) {
    const scored = Object.values(this.mascots).map((m) => ({ id: m.id, s: this.score(m, now) })).sort((a, b) => b.s - a.s);
    const best = scored[0];
    const current = scored.find((x) => x.id === this.follow);
    if (best.s <= 0) {
      if (!this.quietSince) this.quietSince = now;
      if (now - this.quietSince > 2500) this.follow = null; // everyone idle: show the whole office
      return;
    }
    this.quietSince = 0;
    const settled = now - this.followSince > 1500;
    if (!current || !this.follow || (settled && best.id !== this.follow && best.s > current.s + 0.75)) {
      if (best.id !== this.follow) { this.follow = best.id; this.followSince = now; }
    }
  }

  private buildSnapshot(now: number): OfficeSnapshot {
    return {
      follow: this.follow,
      inbox: this.inbox,
      gateOpen: this.mascots.approval.job?.key === "approve" && this.mascots.approval.phase === "working",
      mascots: MASCOTS.map(({ id }) => {
        const m = this.mascots[id];
        const job = m.job && m.job.key !== "home" ? m.job : undefined;
        return {
          id, phase: m.phase, label: job?.label ?? (m.job?.key === "home" ? m.job.label : undefined),
          station: m.job ? STATIONS[m.job.station].name : undefined, destination: m.job?.station,
          queued: m.queue.length, score: Math.round(this.score(m, now) * 10) / 10,
        };
      }),
    };
  }

  private emit(now: number) {
    const next = this.buildSnapshot(now);
    const key = JSON.stringify(next);
    if (key === this.snapKey) return;
    this.snapKey = key;
    this.snap = next;
    for (const l of this.listeners) l();
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snap;
}
