import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a verification build (e.g. NEXT_DIST_DIR=.next-verify npm run build)
  // run next to `npm run dev` without the two overwriting each other's .next folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
