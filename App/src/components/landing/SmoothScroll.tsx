'use client';

import { ReactLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";

/**
 * Momentum scroll for the landing only — the application routes keep native
 * scrolling. `root` binds Lenis to the document, so this renders nothing and
 * wraps nothing.
 */
export default function SmoothScroll() {
  const reduced = useReducedMotion();
  if (reduced) return null;

  return <ReactLenis root options={{ lerp: 0.08 }} />;
}
