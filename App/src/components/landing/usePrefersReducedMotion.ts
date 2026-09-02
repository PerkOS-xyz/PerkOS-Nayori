'use client';

import { useEffect, useState } from "react";

/**
 * Tracks the OS "reduce motion" setting, including changes made while the page
 * is open. Defaults to true so the very first render is the calm one: motion
 * is opted into after the query resolves, never opted out of.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}
