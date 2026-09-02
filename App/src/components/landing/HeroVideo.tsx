'use client';

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useMdUp } from "./useMdUp";
import { useMounted } from "./useMounted";

/**
 * The hero art, alive.
 *
 * A strict enhancement layered over the still: the component only mounts after
 * hydration, so the WebP is what the browser paints and measures for LCP, and
 * the clip fades in over it once it can play. It never mounts on phones, under
 * reduced motion, or when the connection asks for less data — in every one of
 * those cases the page is exactly what it was before.
 */
export default function HeroVideo() {
  const mounted = useMounted();
  const mdUp = useMdUp();
  const reduced = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [saveData, setSaveData] = useState(true);

  useEffect(() => {
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    setSaveData(Boolean(connection?.saveData));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Some browsers reject the autoplay attribute but allow a muted play()
    // triggered from script; a rejection just leaves the still in place.
    void video.play().catch(() => undefined);
  }, [ready]);

  if (!mounted || !mdUp || reduced || saveData) return null;

  return (
    <video
      ref={videoRef}
      aria-hidden="true"
      muted
      loop
      playsInline
      preload="metadata"
      poster="/brand/Banner-Web.webp"
      onCanPlay={() => setReady(true)}
      className={`absolute inset-0 h-full w-full object-cover object-[72%_top] transition-opacity duration-1000 ease-signature sm:object-[70%_center] lg:object-[64%_center] ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    >
      <source src="/brand/Banner-Web-loop.webm" type="video/webm" />
      <source src="/brand/Banner-Web-loop.mp4" type="video/mp4" />
    </video>
  );
}
