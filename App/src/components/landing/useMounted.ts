'use client';

import { useEffect, useState } from "react";

/**
 * SSR gate for every motion enhancement.
 *
 * Motion computes transforms that differ between server and client, and the
 * resulting hydration mismatch silently breaks the whole subtree: nothing
 * animates and scroll listeners never fire. Components render their static,
 * fully visible markup until this returns true.
 *
 * setTimeout(0) — not requestAnimationFrame, which never fires in a background
 * tab and would leave the page permanently un-enhanced there.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  return mounted;
}
