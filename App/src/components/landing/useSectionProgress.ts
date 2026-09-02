'use client';

import { useEffect, useRef, type RefObject } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * Progress of a tall section through its own pin runway: 0 when its top
 * reaches the top of the viewport, 1 when its bottom does.
 *
 * The measurement is taken on the section itself, which is never transformed —
 * reading progress off a pinned or animated child feeds its own movement back
 * into the calculation and truncates the effect.
 */
export function useSectionProgress(
  ref: RefObject<HTMLElement | null>,
  onProgress: (progress: number) => void,
) {
  const handlerRef = useRef(onProgress);
  handlerRef.current = onProgress;
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Under reduced motion the caller still gets a single call at the start so
    // it can render its resting state; it just never animates.
    if (reduced) {
      handlerRef.current(0);
      return;
    }

    let frame = 0;

    const tick = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const runway = rect.height - window.innerHeight;
      if (runway <= 0) {
        handlerRef.current(0);
        return;
      }
      const progress = Math.min(1, Math.max(0, -rect.top / runway));
      handlerRef.current(progress);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    tick();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref, reduced]);
}
