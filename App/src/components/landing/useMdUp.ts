'use client';

import { useEffect, useState } from "react";

/**
 * Motion is scaled per viewport, not just layout: entrance travels, parallax
 * distances and pin runways all shrink on phones. Defaults to false so the
 * server render matches the smaller, calmer variant.
 */
function useMinWidth(px: number): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${px}px)`);
    const sync = () => setMatches(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [px]);

  return matches;
}

export function useMdUp(): boolean {
  return useMinWidth(768);
}

/**
 * Tailwind's `lg`. Any component whose JavaScript drives a layout that only
 * exists at `lg:` must gate on this, or the two disagree in the band between
 * the breakpoints.
 */
export function useLgUp(): boolean {
  return useMinWidth(1024);
}
