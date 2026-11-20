"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

// The background everywhere the video isn't: a slow navy-and-cyan aurora
// (React Bits). Loaded after the page settles; a still gradient until then,
// and for people who prefer less motion.
const Aurora = dynamic(() => import("@/components/bits/Aurora"), { ssr: false });

export default function Backdrop() {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 600);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(120%_80%_at_50%_0%,#0d3156_0%,#06142b_60%)]">
      {ready && !reduced && (
        <Aurora colorStops={["#0b2a4a", "#2f8fd8", "#7dd3fc", "#1d5fa8"]} amplitude={0.8} blend={0.55} speed={0.4} brightness={0.55}
          opacity={0.6} mouseInteraction={false} dpr={1} className="h-full w-full" />
      )}
    </div>
  );
}
