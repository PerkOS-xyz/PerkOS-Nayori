'use client';

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { LazyMotion } from "motion/react";

const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

// Momentum scroll is a progressive enhancement: it is pulled in after
// hydration and never blocks the first paint of server-rendered content.
const SmoothScroll = dynamic(() => import("./SmoothScroll"), { ssr: false });

/**
 * Landing motion boundary.
 *
 * `strict` rejects the full `motion.*` components at runtime, so every
 * animated element in here has to use the lightweight `m.*` primitives and the
 * feature bundle stays deferred.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <SmoothScroll />
      {children}
    </LazyMotion>
  );
}
