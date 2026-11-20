"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, useAnimations, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  MASCOTS, STATIONS, WALK_SPEED,
  type MascotDef, type MascotId, type OfficeDirector, type OfficeSnapshot, type StationId,
} from "@/lib/office/director";

// The 3D office. Everything that moves reads the OfficeDirector every frame.
// Name tags and station signs are plain DOM elements in the overlay (Office.tsx),
// moved here every frame by projecting their 3D anchor to the screen. (drei's
// <Html> creates a React root per label, which React 19 warns about on unmount.)

export type FollowMode = "auto" | "overview" | MascotId;
export interface ViewControl { az: number; zoom: number }

const SCALE = 0.9; // about 2.4x desk height, like a person at a desk
const FEET = 0.1 * SCALE; // the models' feet sit ~0.1 below their origin
const PROP_OUT = 1.6; // props sit this far outside the stand-here spot

MASCOTS.forEach((m) => useGLTF.preload(m.file));

function dampAngle(from: number, to: number, lambda: number, dt: number) {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return from + d * (1 - Math.exp(-lambda * dt));
}

const dampAngleTo = dampAngle;

/** Advances the director once per frame, before anything reads it. */
function Ticker({ director }: { director: OfficeDirector }) {
  useFrame((_, dt) => director.tick(Math.min(dt, 0.1), performance.now()));
  return null;
}

function Mascot({ def, director, followed, onPick, tops }: {
  def: MascotDef; director: OfficeDirector; followed: boolean; onPick: (id: MascotId) => void;
  /** Where each mascot's name tag goes (just above its head), shared with the label projector. */
  tops: React.RefObject<Partial<Record<MascotId, number>>>;
}) {
  const root = useRef<THREE.Group>(null!);
  const halo = useRef<THREE.Mesh>(null!);
  const { scene, animations } = useGLTF(def.file);
  const { actions } = useAnimations(animations, root);
  const walking = useRef(false);
  // Put the name tag just above this model's own head (the gate mascot is taller than the rest).
  useEffect(() => {
    tops.current[def.id] = new THREE.Box3().setFromObject(scene).max.y * SCALE + FEET + 0.35;
  }, [scene, def.id, tops]);

  useEffect(() => {
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    actions.Idle?.reset().play();
    return () => { actions.Idle?.stop(); actions.Walk?.stop(); };
  }, [actions, scene]);

  useFrame((state, dt) => {
    const m = director.mascots[def.id];
    const g = root.current;
    if (!g) return;
    g.position.set(m.pos.x, 0, m.pos.z);
    g.rotation.y = dampAngle(g.rotation.y, m.heading, 9, dt);
    const isWalking = m.phase === "walking";
    if (isWalking !== walking.current) {
      walking.current = isWalking;
      const [to, from] = isWalking ? [actions.Walk, actions.Idle] : [actions.Idle, actions.Walk];
      to?.reset().fadeIn(0.25).play();
      from?.fadeOut(0.25);
    }
    if (actions.Walk) actions.Walk.timeScale = Math.max(0.8, m.speed / WALK_SPEED);
    // Halo under the mascot: pulses while working, steady when followed.
    const working = m.phase === "working";
    halo.current.visible = working || followed;
    const pulse = working ? 1 + 0.12 * Math.sin(state.clock.elapsedTime * 5) : 1;
    halo.current.scale.setScalar(pulse);
  });

  return (
    <group ref={root} onClick={(e) => { e.stopPropagation(); onPick(def.id); }}>
      <primitive object={scene} position={[0, FEET, 0]} scale={SCALE} />
      <mesh ref={halo} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <ringGeometry args={[1.25, 1.5, 48]} />
        <meshBasicMaterial color={def.color} transparent opacity={followed ? 0.95 : 0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** A ribbon from a walking mascot to where it is headed, and a ring on the destination. */
function Destination({ def, director }: { def: MascotDef; director: OfficeDirector }) {
  const ribbon = useRef<THREE.Mesh>(null!);
  const marker = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    const m = director.mascots[def.id];
    const show = m.phase === "walking" && !!m.job;
    ribbon.current.visible = marker.current.visible = show;
    if (!show) return;
    const dest = director.slot(m.job!.station, def.id);
    const dx = dest.x - m.pos.x, dz = dest.z - m.pos.z;
    const len = Math.hypot(dx, dz);
    ribbon.current.position.set(m.pos.x + dx / 2, 0.025, m.pos.z + dz / 2);
    ribbon.current.rotation.y = Math.atan2(dx, dz);
    ribbon.current.scale.set(1, 1, Math.max(len, 0.01));
    marker.current.position.set(dest.x, 0.03, dest.z);
    marker.current.scale.setScalar(1 + 0.12 * Math.sin(state.clock.elapsedTime * 6));
  });
  return (
    <>
      <mesh ref={ribbon}>
        <boxGeometry args={[0.16, 0.01, 1]} />
        <meshBasicMaterial color={def.color} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={marker} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.75, 1.0, 40]} />
        <meshBasicMaterial color={def.color} transparent opacity={0.85} />
      </mesh>
    </>
  );
}

// ── Command room kit ─────────────────────────────────────────────────────────
// The room is a round command deck: glowing floor rings around a hologram globe,
// a ring of live wall screens, light-strip pillars, server racks and consoles.
// Glowing parts use unlit, additive materials so they read as light, not paint.

const CYAN = "#7dd3fc", BLUE = "#2f8fd8", ORANGE = "#ff8a3d", HULL = "#121e30", HULL_DARK = "#0a1322", TRIM = "#24364f";
const WALL_R = 20, CEIL = 12.5;

function Glow({ color = CYAN, opacity = 1, side }: { color?: string; opacity?: number; side?: THREE.Side }) {
  return <meshBasicMaterial color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={side} />;
}
function Hull({ color = HULL, metal = 0.55 }: { color?: string; metal?: number }) {
  return <meshStandardMaterial color={color} metalness={metal} roughness={0.42} />;
}

/** Wall-screen graphics, drawn on canvases and redrawn a few times a second so the screens feel live. */
type Huds = THREE.CanvasTexture[];
function drawHud(c: HTMLCanvasElement, kind: number, t: number) {
  const g = c.getContext("2d");
  if (!g) return;
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "rgba(60,150,230,0.30)"); bg.addColorStop(1, "rgba(20,60,120,0.12)");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(170,230,255,0.95)"; g.lineWidth = 4;
  const b = 28;
  for (const [x, y, sx, sy] of [[6, 6, 1, 1], [W - 6, 6, -1, 1], [6, H - 6, 1, -1], [W - 6, H - 6, -1, -1]]) {
    g.beginPath(); g.moveTo(x + sx * b, y); g.lineTo(x, y); g.lineTo(x, y + sy * b); g.stroke();
  }
  g.strokeStyle = "rgba(170,230,255,0.22)"; g.lineWidth = 1.5; g.strokeRect(16, 16, W - 32, H - 32);
  g.fillStyle = "rgba(190,235,255,0.9)";
  for (let i = 0; i < 5; i++) g.fillRect(30 + i * 24, 30, 16, 6);
  g.fillRect(W - 170, 30, 140 * (0.55 + 0.45 * Math.sin(t * 0.7 + kind)), 6);
  g.fillStyle = "rgba(190,235,255,0.35)";
  for (let i = 0; i < 3; i++) g.fillRect(30, H - 44 + i * 10, (W - 60) * (0.3 + 0.5 * Math.abs(Math.sin(i * 1.7 + kind + t * 0.15))), 4);
  g.strokeStyle = "rgba(170,230,255,0.9)"; g.fillStyle = "rgba(170,230,255,0.85)";
  const top = 52, bottom = H - 56, mid = (top + bottom) / 2;
  if (kind === 0) { // three dial gauges
    for (let i = 0; i < 3; i++) {
      const cx = W * (0.2 + 0.3 * i), r = Math.min(62, (bottom - top) / 2 - 6), v = 0.5 + 0.42 * Math.sin(t * 0.9 + i * 2.1);
      g.lineWidth = 10; g.strokeStyle = "rgba(170,230,255,0.15)";
      g.beginPath(); g.arc(cx, mid, r, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
      g.strokeStyle = i === 1 ? "rgba(255,170,100,0.95)" : "rgba(170,230,255,0.95)";
      g.beginPath(); g.arc(cx, mid, r, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * v)); g.stroke();
      g.lineWidth = 2; g.strokeStyle = "rgba(170,230,255,0.5)";
      g.beginPath(); g.arc(cx, mid, r * 0.62, 0, Math.PI * 2); g.stroke();
      g.fillRect(cx - 18, mid - 5, 36 * v, 10);
    }
  } else if (kind === 1) { // bar chart
    const n = 20, w = (W - 70) / n;
    for (let i = 0; i < n; i++) {
      const v = 0.25 + 0.7 * Math.abs(Math.sin(t * 0.6 + i * 0.55) * Math.cos(i * 0.31 + t * 0.21));
      g.fillStyle = i % 7 === 3 ? "rgba(255,170,100,0.9)" : "rgba(170,230,255,0.8)";
      g.fillRect(35 + i * w, bottom - (bottom - top) * v, w * 0.62, (bottom - top) * v);
    }
  } else if (kind === 2) { // scrolling line charts
    g.lineWidth = 1; g.strokeStyle = "rgba(170,230,255,0.15)";
    for (let y = top; y <= bottom; y += 24) { g.beginPath(); g.moveTo(30, y); g.lineTo(W - 30, y); g.stroke(); }
    for (const [k, col] of [[0, "rgba(170,230,255,0.95)"], [1, "rgba(255,170,100,0.9)"]] as const) {
      g.lineWidth = 3; g.strokeStyle = col; g.beginPath();
      for (let x = 30; x <= W - 30; x += 8) {
        const u = x * 0.02 + t * (0.8 + k * 0.3);
        const y = mid + (Math.sin(u) * 0.5 + Math.sin(u * 2.3 + k) * 0.3) * (bottom - top) * 0.42;
        if (x === 30) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  } else { // radar sweep
    const cx = W * 0.32, r = (bottom - top) / 2;
    g.lineWidth = 1.5; g.strokeStyle = "rgba(170,230,255,0.35)";
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(cx, mid, (r * k) / 3, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx - r, mid); g.lineTo(cx + r, mid); g.moveTo(cx, mid - r); g.lineTo(cx, mid + r); g.stroke();
    const a = t * 1.6;
    const sweep = g.createRadialGradient(cx, mid, 0, cx, mid, r);
    sweep.addColorStop(0, "rgba(170,230,255,0.5)"); sweep.addColorStop(1, "rgba(170,230,255,0.05)");
    g.fillStyle = sweep; g.beginPath(); g.moveTo(cx, mid); g.arc(cx, mid, r, a - 0.6, a); g.closePath(); g.fill();
    for (let i = 0; i < 9; i++) {
      const ba = i * 2.4, br = r * (0.25 + ((i * 37) % 70) / 100);
      const d = ((a - ba) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      g.fillStyle = `rgba(${i % 3 ? "170,230,255" : "255,170,100"},${Math.max(0.15, 1 - d / 3)})`;
      g.beginPath(); g.arc(cx + Math.cos(ba) * br, mid + Math.sin(ba) * br, 5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "rgba(170,230,255,0.7)";
    for (let i = 0; i < 6; i++) g.fillRect(W * 0.6, top + 8 + i * 26, (W * 0.33) * (0.35 + 0.6 * Math.abs(Math.sin(t * 0.5 + i))), 8);
  }
}

function useHuds(): Huds {
  const huds = useMemo(() => [0, 1, 2, 3].map(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 320;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }), []);
  const last = useRef(-1);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t - last.current < 0.15) return;
    last.current = t;
    huds.forEach((tex, i) => { drawHud(tex.image as HTMLCanvasElement, i, t + i * 3); tex.needsUpdate = true; });
  });
  useEffect(() => () => huds.forEach((t) => t.dispose()), [huds]);
  return huds;
}

/** A floating holo screen showing one of the live HUD graphics. */
function Screen({ huds, kind, w, h, color = CYAN, opacity = 0.95 }: { huds: Huds; kind: number; w: number; h: number; color?: string; opacity?: number }) {
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={huds[kind % huds.length]} color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** A console: dark hull, a glowing edge in the owner's color, and (optionally) a live holo screen. */
function Console({ color, huds, screen }: { color: string; huds: Huds; screen?: number }) {
  return (
    <group>
      <mesh position={[0, 0.42, -0.1]} castShadow receiveShadow><boxGeometry args={[2.5, 0.84, 0.9]} /><Hull /></mesh>
      <mesh position={[0, 0.9, 0.05]} rotation-x={-0.25} castShadow><boxGeometry args={[2.7, 0.1, 1.15]} /><Hull color={TRIM} /></mesh>
      <mesh position={[0, 0.9, 0.64]} rotation-x={-0.25}><boxGeometry args={[2.7, 0.04, 0.04]} /><Glow color={color} /></mesh>
      <mesh position={[0, 0.06, 0.36]}><boxGeometry args={[2.4, 0.04, 0.02]} /><Glow color={color} opacity={0.7} /></mesh>
      {screen !== undefined && (
        <group position={[0, 1.75, -0.35]}>
          <Screen huds={huds} kind={screen} w={1.9} h={1.15} color={color} />
          <mesh position={[0, -0.72, 0]}><boxGeometry args={[0.06, 0.3, 0.06]} /><Hull color={TRIM} /></mesh>
        </group>
      )}
    </group>
  );
}

function Prop({ id, color, snap, huds }: { id: StationId; color: string; snap: OfficeSnapshot; huds: Huds }) {
  const boom = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    if (boom.current) boom.current.rotation.z = THREE.MathUtils.damp(boom.current.rotation.z, snap.gateOpen ? 1.25 : 0, 4, dt);
    if (spin.current) { spin.current.rotation.y += dt * 0.8; spin.current.position.y = 1.55 + Math.sin(state.clock.elapsedTime * 1.4) * 0.06; }
  });
  switch (id) {
    case "desk": return <Console color={color} huds={huds} screen={2} />;
    case "reading": return (
      <group>
        <Console color={color} huds={huds} />
        <group ref={spin}>
          {[0, 1, 2].map((i) => <mesh key={i} position={[-0.5 + i * 0.5, i * 0.12, 0]} rotation-y={(i - 1) * 0.35}><planeGeometry args={[0.42, 0.56]} /><Glow color="#cdeaff" opacity={0.55} side={THREE.DoubleSide} /></mesh>)}
        </group>
      </group>
    );
    case "lab": return (
      <group>
        <Console color={color} huds={huds} screen={3} />
        <mesh position={[1.0, 1.25, 0.15]}><sphereGeometry args={[0.24, 24, 24]} /><Glow color="#b48cff" /></mesh>
        <mesh position={[1.0, 1.25, 0.15]}><sphereGeometry args={[0.36, 16, 12]} /><meshBasicMaterial color="#b48cff" wireframe transparent opacity={0.35} toneMapped={false} /></mesh>
      </group>
    );
    case "inbox": return (
      <group>
        <Console color={color} huds={huds} />
        <mesh position={[0, 1.0, 0]}><boxGeometry args={[1.0, 0.06, 0.7]} /><Hull color={TRIM} /></mesh>
        {Array.from({ length: Math.min(snap.inbox, 12) }, (_, i) => (
          <mesh key={i} position={[0, 1.06 + i * 0.05, 0]} rotation-y={(i % 3) * 0.08}><boxGeometry args={[0.8, 0.025, 0.58]} /><Glow color={i % 2 ? "#cdeaff" : CYAN} opacity={0.6} /></mesh>
        ))}
      </group>
    );
    case "records": return (
      <group>
        {[-0.7, 0.7].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 1.0, 0]} castShadow><boxGeometry args={[1.1, 2.0, 0.9]} /><Hull color={HULL_DARK} /></mesh>
            {[0.4, 0.85, 1.3, 1.75].map((y) => <mesh key={y} position={[0, y, 0.46]}><boxGeometry args={[0.85, 0.03, 0.02]} /><Glow color={color} opacity={0.8} /></mesh>)}
          </group>
        ))}
      </group>
    );
    case "board": return (
      <group>
        <mesh position={[0, 1.6, -0.05]}><boxGeometry args={[3.1, 1.8, 0.05]} /><Hull color={HULL_DARK} /></mesh>
        <group position={[0, 1.6, 0.02]}><Screen huds={huds} kind={1} w={3.0} h={1.7} color={color} opacity={0.6} /></group>
        {[[-1, 1.95, ORANGE], [-0.3, 1.3, CYAN], [0.5, 1.9, "#ff9db0"], [1.0, 1.25, ORANGE], [-0.9, 1.1, "#ff9db0"]].map(([x, y, c], i) => (
          <mesh key={i} position={[x as number, y as number, 0.06]}><planeGeometry args={[0.45, 0.36]} /><Glow color={c as string} opacity={0.7} /></mesh>
        ))}
        {[-1.3, 1.3].map((x) => <mesh key={x} position={[x, 0.35, 0]}><boxGeometry args={[0.1, 0.7, 0.1]} /><Hull color={TRIM} /></mesh>)}
      </group>
    );
    case "graph": {
      const nodes: [number, number][] = [[-1, 1.95], [-1, 1.25], [0, 1.65], [1, 2.05], [1, 1.15]];
      return (
        <group>
          <mesh position={[0, 1.6, -0.06]} castShadow><boxGeometry args={[3.0, 1.8, 0.08]} /><Hull color={HULL_DARK} /></mesh>
          {[[0, 2], [1, 2], [2, 3], [2, 4]].map(([a, b2], i) => {
            const [x1, y1] = nodes[a], [x2, y2] = nodes[b2];
            return <mesh key={i} position={[(x1 + x2) / 2, (y1 + y2) / 2, 0.01]} rotation-z={Math.atan2(y2 - y1, x2 - x1)}><planeGeometry args={[Math.hypot(x2 - x1, y2 - y1), 0.03]} /><Glow color={color} opacity={0.6} /></mesh>;
          })}
          {nodes.map(([x, y], i) => <mesh key={i} position={[x, y, 0.02]}><circleGeometry args={[0.13, 20]} /><Glow color={i === 2 ? ORANGE : color} /></mesh>)}
          <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.15, 0.7, 0.15]} /><Hull color={TRIM} /></mesh>
        </group>
      );
    }
    case "library": return (
      <group>
        <mesh position={[0, 1.2, 0]} castShadow><boxGeometry args={[2.6, 2.4, 0.7]} /><Hull color={HULL_DARK} /></mesh>
        {[0.45, 1.05, 1.65].map((y) => Array.from({ length: 9 }, (_, i) => (
          <mesh key={`${y}-${i}`} position={[-1.05 + i * 0.26, y + 0.2, 0.36]}><boxGeometry args={[0.16, 0.4, 0.02]} /><Glow color={[CYAN, color, ORANGE, "#9be7c4", BLUE][(i + y * 10) % 5 | 0]} opacity={0.75} /></mesh>
        )))}
      </group>
    );
    case "phone": return (
      <group>
        <Console color={color} huds={huds} screen={0} />
        <mesh position={[0.6, 1.15, 0.2]}><torusGeometry args={[0.22, 0.03, 8, 32]} /><Glow color={ORANGE} /></mesh>
        <mesh position={[0.6, 1.15, 0.2]}><torusGeometry args={[0.34, 0.015, 8, 32]} /><Glow color={ORANGE} opacity={0.5} /></mesh>
      </group>
    );
    case "packets": return (
      <group>
        <Console color={color} huds={huds} />
        {[-0.7, -0.1, 0.5].map((x, i) => <mesh key={x} position={[x, 1.02 + i * 0.01, 0.05]} rotation-y={(i - 1) * 0.15}><boxGeometry args={[0.55, 0.02, 0.38]} /><Glow color="#ffd8a8" opacity={0.65} /></mesh>)}
      </group>
    );
    case "gate": return (
      <group>
        {[-1.3, 1.3].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 0.8, 0]} castShadow><boxGeometry args={[0.3, 1.6, 0.3]} /><Hull color={TRIM} /></mesh>
            <mesh position={[0, 0.8, 0.16]}><boxGeometry args={[0.06, 1.3, 0.02]} /><Glow color={snap.gateOpen ? "#5fc48c" : color} /></mesh>
          </group>
        ))}
        <group ref={boom} position={[-1.3, 1.3, 0]}>
          <mesh position={[1.3, 0, 0]}><boxGeometry args={[2.6, 0.1, 0.1]} /><Glow color={ORANGE} /></mesh>
        </group>
      </group>
    );
    case "outbox": return (
      <group>
        <mesh position={[0, 0.55, 0]} castShadow><cylinderGeometry args={[0.2, 0.3, 1.1, 16]} /><Hull color={TRIM} /></mesh>
        <mesh position={[0, 1.4, 0]} castShadow><boxGeometry args={[1.0, 0.65, 0.7]} /><Hull /></mesh>
        <mesh position={[0, 1.5, 0.36]}><boxGeometry args={[0.6, 0.06, 0.02]} /><Glow color={color} /></mesh>
        <mesh position={[0, 1.25, 0.36]}><boxGeometry args={[0.8, 0.02, 0.02]} /><Glow color={CYAN} opacity={0.6} /></mesh>
      </group>
    );
  }
}

/** Where a station's prop stands: just outside its stand-here spot. */
export function propPosition(id: StationId) {
  const s = STATIONS[id];
  const r = Math.hypot(s.spot.x, s.spot.z);
  const k = (r + PROP_OUT) / r;
  return { x: s.spot.x * k, z: s.spot.z * k };
}

function Stations({ snap, huds }: { snap: OfficeSnapshot; huds: Huds }) {
  return (
    <>
      {(Object.keys(STATIONS) as StationId[]).map((id) => {
        const p = propPosition(id);
        const owner = MASCOTS.find((m) => m.home === id);
        return (
          <group key={id} position={[p.x, 0, p.z]} rotation-y={STATIONS[id].facing + Math.PI}>
            <Prop id={id} color={owner?.color ?? CYAN} snap={snap} huds={huds} />
            {/* a glowing pad in front of each station */}
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 1.2]}><ringGeometry args={[0.9, 1.0, 40, 1, 0, Math.PI]} /><Glow color={owner?.color ?? CYAN} opacity={0.35} /></mesh>
          </group>
        );
      })}
    </>
  );
}

/** Light pulses running along the floor from the globe out to each station; faster where someone is at work. */
function DataStreams({ snap }: { snap: OfficeSnapshot }) {
  const ids = Object.keys(STATIONS) as StationId[];
  const PER = 3;
  const packets = useRef<THREE.InstancedMesh>(null!);
  const phase = useRef(ids.map((_, i) => i * 0.37));
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const busy = new Set(snap.mascots.filter((m) => m.phase !== "idle" && m.destination).map((m) => m.destination!));
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useFrame((_, dt) => {
    ids.forEach((id, i) => {
      const on = busyRef.current.has(id);
      phase.current[i] = (phase.current[i] + dt * (on ? 0.9 : 0.22)) % 1;
      const s = STATIONS[id].spot, r = Math.hypot(s.x, s.z);
      for (let k = 0; k < PER; k++) {
        const u = (phase.current[i] + k / PER) % 1;
        const d = 1.9 + u * (r - 2.6);
        tmp.position.set((s.x / r) * d, 0.05, (s.z / r) * d);
        tmp.scale.setScalar((on ? 1.4 : 0.8) * Math.sin(u * Math.PI));
        tmp.updateMatrix();
        packets.current.setMatrixAt(i * PER + k, tmp.matrix);
      }
    });
    packets.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      {ids.map((id) => {
        const s = STATIONS[id].spot, r = Math.hypot(s.x, s.z), mid = (1.9 + r - 0.7) / 2;
        return (
          <mesh key={id} position={[(s.x / r) * mid, 0.008, (s.z / r) * mid]} rotation-y={Math.atan2(s.x, s.z)} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.05, r - 2.6]} />
            <Glow color={CYAN} opacity={busy.has(id) ? 0.55 : 0.16} />
          </mesh>
        );
      })}
      <instancedMesh ref={packets} args={[undefined, undefined, ids.length * PER]} frustumCulled={false}>
        <sphereGeometry args={[0.09, 10, 8]} />
        <Glow color="#bfeaff" />
      </instancedMesh>
    </>
  );
}

/**
 * Moves the overlay's DOM labels to their 3D anchors every frame: "m:<mascot>"
 * above a mascot's head, "s:<station>" above a station's prop. Nearer labels
 * stack on top; labels behind the camera are hidden.
 */
function LabelProjector({ director, labels, tops }: {
  director: OfficeDirector; labels: React.RefObject<Map<string, HTMLElement>>; tops: React.RefObject<Partial<Record<MascotId, number>>>;
}) {
  const { camera, size } = useThree();
  const v = useRef(new THREE.Vector3());
  useFrame(() => {
    camera.updateMatrixWorld(); // the rig just moved the camera; project with this frame's view, not last frame's
    for (const [key, el] of labels.current) {
      const [kind, id] = key.split(":");
      if (kind === "m") {
        const m = director.mascots[id as MascotId];
        if (!m) continue;
        v.current.set(m.pos.x, tops.current[id as MascotId] ?? 2.7, m.pos.z);
      } else {
        const p = propPosition(id as StationId);
        v.current.set(p.x, 2.75, p.z);
      }
      v.current.project(camera);
      const visible = v.current.z < 1 && Math.abs(v.current.x) < 0.9 && Math.abs(v.current.y) < 0.92;
      el.style.opacity = visible ? "1" : "0";
      if (!visible) continue;
      const x = ((v.current.x + 1) / 2) * size.width;
      const y = ((1 - v.current.y) / 2) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      el.style.zIndex = String(Math.round((1 - v.current.z) * 10000));
    }
  });
  return null;
}

const polar = (a: number, r: number): [number, number] => [Math.sin(a) * r, Math.cos(a) * r];

/** The central pedestal: concentric floor rings rippling out from a slowly turning hologram globe. */
function Core() {
  const globe = useRef<THREE.Group>(null!);
  const orbitA = useRef<THREE.Mesh>(null!);
  const orbitB = useRef<THREE.Mesh>(null!);
  const ripples = useRef<THREE.Mesh[]>([]);
  const dots = useMemo(() => {
    // dots on a sphere (a "hologram planet"), thinned out into patchy land masses
    const pts: number[] = [];
    const n = 900;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - y * y), th = i * 2.39996;
      const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
      if (Math.sin(x * 3.1) + Math.cos(z * 2.7 + y * 1.9) + Math.sin(y * 4.2) > 0.35) pts.push(x * 1.02, y * 1.02, z * 1.02);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useEffect(() => () => dots.dispose(), [dots]);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    globe.current.rotation.y += dt * 0.25;
    globe.current.position.y = 4.7 + Math.sin(t * 0.8) * 0.08;
    orbitA.current.rotation.z += dt * 0.5;
    orbitB.current.rotation.z -= dt * 0.35;
    ripples.current.forEach((m, i) => {
      if (!m) return;
      const u = (t * 0.28 + i / 3) % 1;
      m.scale.setScalar(1 + u * 3.2);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - u);
    });
  });
  return (
    <group>
      {/* steady rings */}
      {[[1.3, 1.42, 0.9], [2.1, 2.16, 0.55], [3.0, 3.05, 0.45], [4.1, 4.14, 0.3], [5.4, 5.44, 0.22]].map(([a, b, o]) => (
        <mesh key={a} rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}><ringGeometry args={[a, b, 96]} /><Glow opacity={o} /></mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.009, 0]}><circleGeometry args={[1.3, 64]} /><Glow color={BLUE} opacity={0.25} /></mesh>
      {/* rings rippling outward */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => { if (m) ripples.current[i] = m; }} rotation-x={-Math.PI / 2} position={[0, 0.011, 0]}>
          <ringGeometry args={[1.5, 1.56, 96]} /><Glow opacity={0.4} />
        </mesh>
      ))}
      {/* the pedestal (low, so the helpers can walk across it) and the light beam */}
      <mesh position={[0, 0.1, 0]} receiveShadow><cylinderGeometry args={[0.95, 1.05, 0.2, 48]} /><Hull color={TRIM} metal={0.7} /></mesh>
      <mesh position={[0, 0.21, 0]} rotation-x={-Math.PI / 2}><ringGeometry args={[0.7, 0.92, 48]} /><Glow /></mesh>
      <mesh position={[0, 2.0, 0]}><cylinderGeometry args={[1.0, 0.75, 3.6, 48, 1, true]} /><Glow color={BLUE} opacity={0.12} side={THREE.DoubleSide} /></mesh>
      {/* the globe */}
      <group ref={globe} position={[0, 4.7, 0]} scale={1.05}>
        <mesh><sphereGeometry args={[0.98, 32, 24]} /><Glow color={BLUE} opacity={0.22} /></mesh>
        <mesh><sphereGeometry args={[1.0, 24, 16]} /><meshBasicMaterial color={CYAN} wireframe transparent opacity={0.18} toneMapped={false} depthWrite={false} /></mesh>
        <points geometry={dots}><pointsMaterial color="#bfeaff" size={0.045} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></points>
        <mesh ref={orbitA} rotation-x={Math.PI / 2.4}><torusGeometry args={[1.45, 0.012, 8, 96]} /><Glow /></mesh>
        <mesh ref={orbitB} rotation-x={Math.PI / 1.7} rotation-y={0.4}><torusGeometry args={[1.7, 0.008, 8, 96]} /><Glow color={ORANGE} opacity={0.7} /></mesh>
      </group>
      <pointLight position={[0, 4.7, 0]} color={CYAN} intensity={40} distance={16} decay={1.6} />
    </group>
  );
}

/** The ceiling: a big glowing light ring with radial light panels. */
function Ceiling() {
  const ring = useRef<THREE.Mesh>(null!);
  useFrame((state) => { (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.85 + 0.15 * Math.sin(state.clock.elapsedTime * 1.3); });
  return (
    <group position={[0, CEIL, 0]}>
      <mesh rotation-x={Math.PI / 2}><circleGeometry args={[WALL_R, 96]} /><meshStandardMaterial color={HULL_DARK} side={THREE.DoubleSide} metalness={0.6} roughness={0.5} /></mesh>
      <mesh ref={ring} rotation-x={Math.PI / 2} position={[0, -0.05, 0]}><torusGeometry args={[4.6, 0.16, 12, 128]} /><Glow color="#5cc8ff" /></mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, -0.04, 0]}><ringGeometry args={[3.2, 4.3, 96]} /><Glow color={BLUE} opacity={0.3} side={THREE.DoubleSide} /></mesh>
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2, [x, z] = polar(a, 9.6);
        return <mesh key={i} position={[x, -0.04, z]} rotation-y={a} rotation-x={Math.PI / 2}><planeGeometry args={[0.55, 8.2]} /><Glow color={i % 2 ? BLUE : CYAN} opacity={i % 2 ? 0.25 : 0.45} side={THREE.DoubleSide} /></mesh>;
      })}
      <mesh rotation-x={Math.PI / 2} position={[0, -0.05, 0]}><torusGeometry args={[14, 0.08, 8, 128]} /><Glow opacity={0.7} /></mesh>
    </group>
  );
}

/** The curved outer wall: pillars with light strips, big live screens between them, and a sealed door. */
function Wall({ huds }: { huds: Huds }) {
  const N = 16;
  const DOOR = 13; // the slot facing the gap between the outbox and the AI desk
  return (
    <group>
      <mesh position={[0, CEIL / 2, 0]}><cylinderGeometry args={[WALL_R, WALL_R, CEIL, 96, 1, true]} /><meshStandardMaterial color={HULL_DARK} side={THREE.BackSide} metalness={0.5} roughness={0.55} /></mesh>
      {[0.35, 2.0, 9.6, CEIL - 0.3].map((y, i) => (
        <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[WALL_R - 0.05, WALL_R - 0.05, i === 0 ? 0.08 : 0.04, 96, 1, true]} /><Glow color={i === 0 ? CYAN : i === 2 ? ORANGE : BLUE} opacity={i === 0 ? 0.9 : 0.5} side={THREE.BackSide} /></mesh>
      ))}
      {Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2, [x, z] = polar(a, WALL_R - 0.5);
        const strip = i % 4 === 0 ? ORANGE : CYAN;
        return (
          <group key={`p${i}`} position={[x, 0, z]} rotation-y={a + Math.PI}>
            <mesh position={[0, CEIL / 2, 0]} castShadow><boxGeometry args={[1.0, CEIL, 1.0]} /><Hull color={HULL} /></mesh>
            <mesh position={[0, CEIL / 2, 0.51]}><planeGeometry args={[0.12, CEIL - 2.5]} /><Glow color={strip} /></mesh>
            <mesh position={[0, 0.3, 0.6]}><boxGeometry args={[1.2, 0.6, 0.2]} /><Hull color={TRIM} /></mesh>
          </group>
        );
      })}
      {Array.from({ length: N }, (_, i) => {
        const a = ((i + 0.5) / N) * Math.PI * 2, [x, z] = polar(a, WALL_R - 0.25);
        if (i === DOOR) return (
          <group key={`s${i}`} position={[x, 0, z]} rotation-y={a + Math.PI}>
            <mesh position={[0, 2.9, 0]}><boxGeometry args={[3.6, 5.8, 0.2]} /><Hull color={TRIM} metal={0.7} /></mesh>
            {[-0.9, 0.9].map((dx) => <mesh key={dx} position={[dx, 2.8, 0.12]}><boxGeometry args={[1.72, 5.4, 0.08]} /><Hull color={HULL} metal={0.7} /></mesh>)}
            <mesh position={[0, 2.8, 0.17]}><planeGeometry args={[0.05, 5.4]} /><Glow color={ORANGE} /></mesh>
            {[[0, 5.85, 3.8, 0.08], [-1.85, 2.9, 0.08, 5.9], [1.85, 2.9, 0.08, 5.9]].map(([px, py, w, h], k) => <mesh key={k} position={[px, py, 0.12]}><planeGeometry args={[w, h]} /><Glow color={ORANGE} /></mesh>)}
            <mesh position={[0, 6.6, 0.12]}><planeGeometry args={[1.4, 0.3]} /><Glow color="#ff4d4d" opacity={0.8} /></mesh>
          </group>
        );
        const big = i % 2 === 0;
        return (
          <group key={`s${i}`} position={[x, 0, z]} rotation-y={a + Math.PI}>
            {big ? (
              <>
                <group position={[0, 5.6, 0]}><Screen huds={huds} kind={i % 4} w={6.2} h={3.9} /></group>
                <group position={[-1.6, 2.6, 0]}><Screen huds={huds} kind={(i + 1) % 4} w={2.6} h={1.5} color={ORANGE} opacity={0.75} /></group>
                <group position={[1.6, 2.6, 0]}><Screen huds={huds} kind={(i + 2) % 4} w={2.6} h={1.5} opacity={0.75} /></group>
              </>
            ) : (
              <>
                <group position={[0, 7.0, 0]}><Screen huds={huds} kind={(i + 3) % 4} w={5.2} h={2.4} /></group>
                <group position={[0, 4.3, 0]}><Screen huds={huds} kind={(i + 1) % 4} w={5.2} h={2.4} color="#9fd8ff" opacity={0.7} /></group>
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Server racks along the wall, their lights blinking. */
function Racks() {
  const leds = useRef<THREE.InstancedMesh>(null!);
  const racks = useMemo(() => {
    const out: { x: number; z: number; a: number }[] = [];
    [0.55, 1.35, 2.2, 3.35, 4.35, 5.4].forEach((a0) => {
      for (let k = -1; k <= 1; k++) {
        const a = a0 + k * 0.075, [x, z] = polar(a, 17.6);
        out.push({ x, z, a });
      }
    });
    return out;
  }, []);
  const PER = 14;
  const palette = useMemo(() => [new THREE.Color("#4dff9a"), new THREE.Color("#ff4d4d"), new THREE.Color(CYAN), new THREE.Color("#0a1322")], []);
  useEffect(() => {
    const o = new THREE.Object3D();
    racks.forEach((r, i) => {
      for (let k = 0; k < PER; k++) {
        const col = k % 2, row = (k / 2) | 0;
        o.position.set(r.x, 0.5 + row * 0.32, r.z);
        o.rotation.set(0, r.a + Math.PI, 0);
        o.translateX(-0.22 + col * 0.44);
        o.translateZ(0.42);
        o.updateMatrix();
        leds.current.setMatrixAt(i * PER + k, o.matrix);
        leds.current.setColorAt(i * PER + k, palette[(i * 7 + k * 3) % 3]);
      }
    });
    leds.current.instanceMatrix.needsUpdate = true;
    if (leds.current.instanceColor) leds.current.instanceColor.needsUpdate = true;
  }, [racks, palette]);
  const last = useRef(0);
  useFrame((state) => {
    if (state.clock.elapsedTime - last.current < 0.12) return;
    last.current = state.clock.elapsedTime;
    const n = racks.length * PER;
    for (let j = 0; j < 14; j++) {
      const idx = Math.floor(Math.random() * n), roll = Math.random();
      leds.current.setColorAt(idx, palette[roll < 0.55 ? 0 : roll < 0.65 ? 1 : roll < 0.85 ? 2 : 3]);
    }
    if (leds.current.instanceColor) leds.current.instanceColor.needsUpdate = true;
  });
  return (
    <>
      {racks.map((r, i) => (
        <group key={i} position={[r.x, 0, r.z]} rotation-y={r.a + Math.PI}>
          <mesh position={[0, 1.4, 0]} castShadow><boxGeometry args={[1.25, 2.8, 0.8]} /><Hull color={HULL} /></mesh>
          <mesh position={[0, 1.4, 0.41]}><planeGeometry args={[1.05, 2.6]} /><meshStandardMaterial color="#060c18" metalness={0.3} roughness={0.3} /></mesh>
          <mesh position={[0, 2.75, 0.41]}><planeGeometry args={[1.05, 0.04]} /><Glow color={CYAN} opacity={0.8} /></mesh>
        </group>
      ))}
      <instancedMesh ref={leds} args={[undefined, undefined, racks.length * PER]} frustumCulled={false}>
        <boxGeometry args={[0.16, 0.05, 0.02]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}

/** Standing consoles in an outer ring, each with a small live screen. */
function OuterConsoles({ huds }: { huds: Huds }) {
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + 0.11, [x, z] = polar(a, 13.6);
        return (
          <group key={i} position={[x, 0, z]} rotation-y={a + Math.PI}>
            <mesh position={[0, 0.55, 0]} castShadow><boxGeometry args={[0.5, 1.1, 0.45]} /><Hull color={TRIM} /></mesh>
            <mesh position={[0, 1.2, 0.05]} rotation-x={-0.6} castShadow><boxGeometry args={[1.3, 0.08, 0.8]} /><Hull /></mesh>
            <mesh position={[0, 1.25, 0.06]} rotation-x={-0.6 - Math.PI / 2}><planeGeometry args={[1.15, 0.65]} /><meshBasicMaterial map={huds[i % 4]} color={i % 3 ? CYAN : ORANGE} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
            <group position={[0, 2.15, -0.1]}><Screen huds={huds} kind={(i + 2) % 4} w={1.2} h={0.75} opacity={0.55} /></group>
          </group>
        );
      })}
    </>
  );
}

/** Dust motes drifting up through the light. */
function Motes() {
  const COUNT = 420;
  const geo = useMemo(() => {
    const p = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.sqrt(Math.random()) * 16;
      p[i * 3] = Math.sin(a) * r; p[i * 3 + 1] = Math.random() * CEIL; p[i * 3 + 2] = Math.cos(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((_, dt) => {
    const a = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      let y = a.getY(i) + dt * (0.15 + (i % 7) * 0.03);
      if (y > CEIL) y = 0;
      a.setY(i, y);
    }
    a.needsUpdate = true;
  });
  return <points geometry={geo}><pointsMaterial color={CYAN} size={0.05} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></points>;
}

function Room({ huds }: { huds: Huds }) {
  const grid = useMemo(() => {
    const g = new THREE.PolarGridHelper(WALL_R, 24, 10, 96, "#1f3d63", "#16304f");
    (g.material as THREE.Material).transparent = true;
    (g.material as THREE.Material).opacity = 0.55;
    g.position.y = 0.004;
    return g;
  }, []);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[WALL_R, 96]} /><meshStandardMaterial color="#0b1526" metalness={0.65} roughness={0.38} /></mesh>
      <primitive object={grid} />
      {/* the orange-trimmed platform edge, and an outer service ring */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]}><ringGeometry args={[10.7, 10.85, 128]} /><Glow color={ORANGE} opacity={0.9} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]}><ringGeometry args={[10.85, 11.6, 128]} /><meshStandardMaterial color="#141f30" metalness={0.7} roughness={0.35} /></mesh>
      {Array.from({ length: 48 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2, [x, z] = polar(a, 11.25);
        return <mesh key={i} position={[x, 0.007, z]} rotation-y={a} rotation-x={-Math.PI / 2}><planeGeometry args={[0.5, 0.12]} /><Glow color={i % 6 === 0 ? ORANGE : CYAN} opacity={i % 6 === 0 ? 0.9 : 0.35} /></mesh>;
      })}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]}><ringGeometry args={[15.9, 16.0, 128]} /><Glow color={CYAN} opacity={0.35} /></mesh>
      <Core />
      <Ceiling />
      <Wall huds={huds} />
      <Racks />
      <OuterConsoles huds={huds} />
      <Motes />
    </>
  );
}

function CameraRig({ director, mode, view, rightInset }: { director: OfficeDirector; mode: FollowMode; view: React.RefObject<ViewControl>; rightInset: number }) {
  const { camera, size } = useThree();
  const right = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const want = useRef(new THREE.Vector3());
  const wantLook = useRef(new THREE.Vector3());
  const baseAz = useRef(0); // which side the camera looks from; for a followed mascot, from the open center of the room
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  useFrame((_, dt) => {
    const id = mode === "auto" ? director.follow : mode === "overview" ? null : mode;
    const m = id ? director.mascots[id] : null;
    const { az, zoom } = view.current ?? { az: 0, zoom: 1 };
    // Narrow (phone) views see less side to side, so step back to keep the same framing.
    const narrow = Math.min(1.8, Math.max(1, 1.25 / (size.width / size.height)));
    const dist = (m ? 11.5 : 19) * zoom * narrow, h = (m ? 6.5 : 10.5) * zoom * narrow;
    const tx = m ? m.pos.x : 0, tz = m ? m.pos.z : -0.8;
    // Desks ring the room and the middle is open, so shooting from the middle outward never
    // puts another desk or mascot between the camera and the one being followed.
    const fromCenter = m && Math.hypot(m.pos.x, m.pos.z) > 1.5 ? Math.atan2(-m.pos.x, -m.pos.z) : m ? baseAz.current : 0;
    baseAz.current = dampAngleTo(baseAz.current, fromCenter, reduced ? 100 : 1.6, dt);
    const a = baseAz.current + az + (m ? 0.6 : 0); // a little off-center: a three-quarter view, not straight at their back
    want.current.set(tx + Math.sin(a) * dist, h, tz + Math.cos(a) * dist);
    wantLook.current.set(tx, m ? 1.3 : 0.8, tz);
    // A panel covers the right side of the screen: slide the view sideways so the
    // subject sits in the middle of the part you can still see.
    if (rightInset > 0 && size.width > rightInset) {
      const cam = camera as THREE.PerspectiveCamera;
      const fwd = right.current.subVectors(wantLook.current, want.current);
      const d = fwd.length();
      fwd.cross(camera.up).normalize();
      const shift = d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * (size.width / size.height) * (rightInset / size.width);
      want.current.addScaledVector(fwd, shift);
      wantLook.current.addScaledVector(fwd, shift);
    }
    const k = reduced ? 1 : 1 - Math.exp(-2.4 * dt);
    camera.position.lerp(want.current, k);
    look.current.lerp(wantLook.current, k);
    camera.lookAt(look.current);
  });
  return null;
}

/** Lights, the room and the stations, all sharing the live screen graphics. */
function SceneContent({ snap }: { snap: OfficeSnapshot }) {
  const huds = useHuds();
  return (
    <>
      <ambientLight color="#5b7cab" intensity={0.55} />
      <hemisphereLight args={["#9cc9ff", "#0b1526", 0.9]} />
      <directionalLight position={[6, 14, 9]} intensity={1.3} color="#dbe9ff" />
      <pointLight position={[0, CEIL - 1, 0]} color="#5cc8ff" intensity={60} distance={30} decay={1.4} />
      <pointLight position={[-14, 4, -10]} color={ORANGE} intensity={25} distance={18} decay={1.6} />
      <pointLight position={[14, 4, -10]} color={CYAN} intensity={25} distance={18} decay={1.6} />
      <Room huds={huds} />
      <Stations snap={snap} huds={huds} />
      <DataStreams snap={snap} />
    </>
  );
}

export default function OfficeScene({ director, snap, mode, view, onPick, rightInset = 0, labels }: {
  director: OfficeDirector; snap: OfficeSnapshot; mode: FollowMode; view: React.RefObject<ViewControl>; onPick: (id: MascotId) => void;
  /** Pixels on the right covered by a panel; the camera centers the subject in the rest. */
  rightInset?: number;
  /** The overlay's label elements, keyed "m:<mascot>" and "s:<station>". */
  labels: React.RefObject<Map<string, HTMLElement>>;
}) {
  const followed = mode === "auto" ? snap.follow : mode === "overview" ? null : mode;
  const tops = useRef<Partial<Record<MascotId, number>>>({});
  return (
    <Canvas
      camera={{ position: [0, 10.5, 18], fov: 42, near: 0.1, far: 200 }}
      dpr={[1, 1.5]}
      fallback={<div className="grid h-full place-items-center text-sm text-muted">This device can&apos;t show the 3D office.</div>}
    >
      <color attach="background" args={["#030914"]} />
      <fog attach="fog" args={["#030914", 30, 75]} />
      <Ticker director={director} />
      <SceneContent snap={snap} />
      <Suspense fallback={null}>
        {MASCOTS.map((def) => (
          <Mascot key={def.id} def={def} director={director} followed={followed === def.id} onPick={onPick} tops={tops} />
        ))}
      </Suspense>
      {MASCOTS.map((def) => <Destination key={def.id} def={def} director={director} />)}
      <ContactShadows position={[0, 0.01, 0]} scale={30} opacity={0.55} blur={2.4} far={4} resolution={512} color="#000814" />
      <CameraRig director={director} mode={mode} view={view} rightInset={rightInset} />
      <LabelProjector director={director} labels={labels} tops={tops} />
    </Canvas>
  );
}
