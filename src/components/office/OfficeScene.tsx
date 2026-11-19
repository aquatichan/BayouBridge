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
        <meshBasicMaterial color={def.color} transparent opacity={followed ? 0.9 : 0.45} />
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
        <meshBasicMaterial color={def.color} transparent opacity={0.5} />
      </mesh>
      <mesh ref={marker} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.75, 1.0, 40]} />
        <meshBasicMaterial color={def.color} transparent opacity={0.85} />
      </mesh>
    </>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

const WOOD = "#c9a27a", PAPER = "#fffdf8", METAL = "#9aa5a3";

function Desk({ color, screen }: { color: string; screen?: string }) {
  return (
    <group>
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow><boxGeometry args={[2.6, 0.1, 1.1]} /><meshStandardMaterial color={WOOD} /></mesh>
      <mesh position={[0, 0.42, -0.35]} castShadow><boxGeometry args={[2.4, 0.84, 0.08]} /><meshStandardMaterial color={color} /></mesh>
      {screen && (
        <group position={[0, 1.3, -0.25]}>
          <mesh castShadow><boxGeometry args={[1.1, 0.7, 0.06]} /><meshStandardMaterial color="#1d2b2a" /></mesh>
          <mesh position={[0, 0, 0.035]}><planeGeometry args={[1.0, 0.6]} /><meshStandardMaterial color={screen} emissive={screen} emissiveIntensity={0.6} /></mesh>
        </group>
      )}
    </group>
  );
}

function Prop({ id, color, snap }: { id: StationId; color: string; snap: OfficeSnapshot }) {
  const boom = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (boom.current) boom.current.rotation.z = THREE.MathUtils.damp(boom.current.rotation.z, snap.gateOpen ? 1.25 : 0, 4, dt);
  });
  switch (id) {
    case "desk": return <Desk color={color} screen="#7fc1b4" />;
    case "reading": return (
      <group>
        <Desk color={color} />
        {[0, 1, 2].map((i) => <mesh key={i} position={[-0.6 + i * 0.5, 0.92 + i * 0.01, 0.1]} rotation-y={i * 0.2}><boxGeometry args={[0.42, 0.02, 0.56]} /><meshStandardMaterial color={PAPER} /></mesh>)}
        <mesh position={[0.9, 1.25, -0.2]}><coneGeometry args={[0.22, 0.3, 20]} /><meshStandardMaterial color="#f2a541" emissive="#f2a541" emissiveIntensity={0.4} /></mesh>
      </group>
    );
    case "lab": return (
      <group>
        <Desk color={color} screen="#b9a3e3" />
        <mesh position={[0.95, 1.2, 0.1]}><sphereGeometry args={[0.22, 24, 24]} /><meshStandardMaterial color="#c9b6f0" emissive="#8a6bd1" emissiveIntensity={0.8} /></mesh>
      </group>
    );
    case "inbox": return (
      <group>
        <Desk color={color} />
        <mesh position={[0, 0.95, 0]}><boxGeometry args={[1.0, 0.08, 0.75]} /><meshStandardMaterial color={METAL} /></mesh>
        {Array.from({ length: Math.min(snap.inbox, 12) }, (_, i) => (
          <mesh key={i} position={[0, 1.0 + i * 0.045, 0]} rotation-y={(i % 3) * 0.08}><boxGeometry args={[0.8, 0.035, 0.6]} /><meshStandardMaterial color={i % 2 ? PAPER : "#f4ecdc"} /></mesh>
        ))}
      </group>
    );
    case "records": return (
      <group>
        {[-0.7, 0.7].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 0.8, 0]} castShadow><boxGeometry args={[1.1, 1.6, 0.9]} /><meshStandardMaterial color={METAL} /></mesh>
            {[0.35, 0.8, 1.25].map((y) => <mesh key={y} position={[0, y, 0.46]}><boxGeometry args={[0.9, 0.34, 0.02]} /><meshStandardMaterial color="#b9c3c1" /></mesh>)}
          </group>
        ))}
      </group>
    );
    case "board": return (
      <group>
        <mesh position={[0, 1.45, 0]} castShadow><boxGeometry args={[3.0, 1.7, 0.08]} /><meshStandardMaterial color="#fbf6ea" /></mesh>
        {[[-1, 1.8, "#f2a541"], [-0.3, 1.2, "#dcebe7"], [0.5, 1.75, "#f7e1da"], [1.0, 1.15, "#f2a541"], [-0.9, 1.0, "#f7e1da"]].map(([x, y, c], i) => (
          <mesh key={i} position={[x as number, y as number, 0.05]}><planeGeometry args={[0.45, 0.38]} /><meshStandardMaterial color={c as string} /></mesh>
        ))}
        {[-1.3, 1.3].map((x) => <mesh key={x} position={[x, 0.3, 0]}><boxGeometry args={[0.08, 0.6, 0.08]} /><meshStandardMaterial color={WOOD} /></mesh>)}
      </group>
    );
    case "graph": return (
      <group>
        <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[3.0, 1.8, 0.1]} /><meshStandardMaterial color="#1d2b2a" /></mesh>
        {[[-1, 1.9], [-1, 1.2], [0, 1.6], [1, 2.0], [1, 1.1]].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0.07]}><circleGeometry args={[0.13, 20]} /><meshStandardMaterial color="#7fc1b4" emissive="#7fc1b4" emissiveIntensity={0.9} /></mesh>
        ))}
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.15, 0.6, 0.15]} /><meshStandardMaterial color={METAL} /></mesh>
      </group>
    );
    case "library": return (
      <group>
        <mesh position={[0, 1.1, 0]} castShadow><boxGeometry args={[2.6, 2.2, 0.7]} /><meshStandardMaterial color={WOOD} /></mesh>
        {[0.45, 1.05, 1.65].map((y) => Array.from({ length: 9 }, (_, i) => (
          <mesh key={`${y}-${i}`} position={[-1.05 + i * 0.26, y + 0.2, 0.3]}><boxGeometry args={[0.2, 0.42, 0.18]} /><meshStandardMaterial color={["#2f5d8a", "#0f4c4a", "#b9791a", "#b8462f", "#4f7d4d"][(i + y * 10) % 5 | 0]} /></mesh>
        )))}
      </group>
    );
    case "phone": return (
      <group>
        <Desk color={color} />
        <mesh position={[0.3, 0.97, 0.05]}><boxGeometry args={[0.5, 0.14, 0.35]} /><meshStandardMaterial color="#b9791a" /></mesh>
        <mesh position={[0.3, 1.08, 0.05]} rotation-z={Math.PI / 2}><capsuleGeometry args={[0.06, 0.35, 6, 12]} /><meshStandardMaterial color="#1d2b2a" /></mesh>
      </group>
    );
    case "packets": return (
      <group>
        <Desk color={color} />
        {[-0.7, -0.1, 0.5].map((x, i) => <mesh key={x} position={[x, 0.93 + i * 0.01, 0.05]} rotation-y={(i - 1) * 0.15}><boxGeometry args={[0.55, 0.03, 0.38]} /><meshStandardMaterial color="#f8ead0" /></mesh>)}
      </group>
    );
    case "gate": return (
      <group>
        {[-1.3, 1.3].map((x) => <mesh key={x} position={[x, 0.7, 0]} castShadow><boxGeometry args={[0.25, 1.4, 0.25]} /><meshStandardMaterial color={color} /></mesh>)}
        <group ref={boom} position={[-1.3, 1.2, 0]}>
          <mesh position={[1.3, 0, 0]}><boxGeometry args={[2.6, 0.12, 0.12]} /><meshStandardMaterial color="#f2a541" /></mesh>
        </group>
      </group>
    );
    case "outbox": return (
      <group>
        <mesh position={[0, 0.55, 0]} castShadow><boxGeometry args={[0.3, 1.1, 0.3]} /><meshStandardMaterial color={METAL} /></mesh>
        <mesh position={[0, 1.35, 0]} castShadow><boxGeometry args={[1.0, 0.6, 0.7]} /><meshStandardMaterial color="#2f5d8a" /></mesh>
        <mesh position={[0, 1.45, 0.36]}><boxGeometry args={[0.6, 0.06, 0.02]} /><meshStandardMaterial color="#1d2b2a" /></mesh>
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

function Stations({ snap }: { snap: OfficeSnapshot }) {
  return (
    <>
      {(Object.keys(STATIONS) as StationId[]).map((id) => {
        const p = propPosition(id);
        const owner = MASCOTS.find((m) => m.home === id);
        return (
          <group key={id} position={[p.x, 0, p.z]} rotation-y={STATIONS[id].facing + Math.PI}>
            <Prop id={id} color={owner?.color ?? "#c9c1ad"} snap={snap} />
          </group>
        );
      })}
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
      const visible = v.current.z < 1 && Math.abs(v.current.x) < 1.3 && Math.abs(v.current.y) < 1.3;
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

function Room() {
  const wall = useMemo(() => new THREE.CylinderGeometry(13, 13, 2.4, 64, 1, true, Math.PI * 0.62, Math.PI * 0.76), []);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[14, 72]} /><meshStandardMaterial color="#efe7d6" /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]}><ringGeometry args={[3.2, 3.5, 64]} /><meshStandardMaterial color="#0f4c4a" transparent opacity={0.25} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, 0]}><circleGeometry args={[3.2, 64]} /><meshStandardMaterial color="#dcebe7" /></mesh>
      <mesh geometry={wall} position={[0, 1.2, 0]}><meshStandardMaterial color="#f7f2e6" side={THREE.BackSide} /></mesh>
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
    const dist = (m ? 11.5 : 17) * zoom * narrow, h = (m ? 7 : 12.5) * zoom * narrow;
    const tx = m ? m.pos.x : 0, tz = m ? m.pos.z : -0.8;
    // Desks ring the room and the middle is open, so shooting from the middle outward never
    // puts another desk or mascot between the camera and the one being followed.
    const fromCenter = m && Math.hypot(m.pos.x, m.pos.z) > 1.5 ? Math.atan2(-m.pos.x, -m.pos.z) : m ? baseAz.current : 0;
    baseAz.current = dampAngleTo(baseAz.current, fromCenter, reduced ? 100 : 1.6, dt);
    const a = baseAz.current + az + (m ? 0.6 : 0); // a little off-center: a three-quarter view, not straight at their back
    want.current.set(tx + Math.sin(a) * dist, h, tz + Math.cos(a) * dist);
    wantLook.current.set(tx, m ? 1.1 : 0, tz);
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
      camera={{ position: [0, 12.5, 16], fov: 40, near: 0.1, far: 200 }}
      dpr={[1, 1.5]}
      fallback={<div className="grid h-full place-items-center text-sm text-muted">This device can&apos;t show the 3D office.</div>}
    >
      <color attach="background" args={["#f5f1e8"]} />
      <fog attach="fog" args={["#f5f1e8", 28, 55]} />
      <Ticker director={director} />
      <hemisphereLight args={["#fff6e5", "#c9c1ad", 1.1]} />
      <directionalLight position={[8, 16, 10]} intensity={1.6} />
      <Room />
      <Stations snap={snap} />
      <Suspense fallback={null}>
        {MASCOTS.map((def) => (
          <Mascot key={def.id} def={def} director={director} followed={followed === def.id} onPick={onPick} tops={tops} />
        ))}
      </Suspense>
      {MASCOTS.map((def) => <Destination key={def.id} def={def} director={director} />)}
      <ContactShadows position={[0, 0.01, 0]} scale={30} opacity={0.3} blur={2.4} far={4} resolution={512} />
      <CameraRig director={director} mode={mode} view={view} rightInset={rightInset} />
      <LabelProjector director={director} labels={labels} tops={tops} />
    </Canvas>
  );
}
