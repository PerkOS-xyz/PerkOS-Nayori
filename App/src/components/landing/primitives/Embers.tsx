'use client';

import { useEffect, useRef } from "react";
import { useMounted } from "../useMounted";
import { useReducedMotion } from "motion/react";

type EmbersProps = {
  className?: string;
  /** Particle count at 1440px wide; scaled down proportionally on smaller viewports. */
  density?: number;
};

type Ember = { x: number; y: number; r: number; vy: number; vx: number; a: number };

/**
 * Drifting ember field, canvas 2D and dependency-free.
 *
 * A three.js particle system would look the same here and cost ~200KB, so the
 * WebGL budget is saved for something genuinely 3D. Purely decorative:
 * aria-hidden, and it does not render at all under reduced motion.
 */
export default function Embers({ className = "", density = 46 }: EmbersProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();
  const mounted = useMounted();

  useEffect(() => {
    if (!mounted || reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let embers: Ember[] = [];
    // Cap the device pixel ratio: a 3x retina buffer triples fill cost for a
    // blur that nobody can resolve anyway.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const seed = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.round(density * Math.min(1, width / 1440));
      embers = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.6 + Math.random() * 1.5,
        vy: -(0.08 + Math.random() * 0.22),
        vx: (Math.random() - 0.5) * 0.14,
        a: 0.18 + Math.random() * 0.5,
      }));
    };

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      for (const e of embers) {
        e.y += e.vy;
        e.x += e.vx;
        if (e.y < -8) {
          e.y = height + 8;
          e.x = Math.random() * width;
        }
        if (e.x < -8) e.x = width + 8;
        if (e.x > width + 8) e.x = -8;

        ctx.beginPath();
        ctx.shadowBlur = 12;
        ctx.shadowColor = "rgba(255, 138, 30, 0.85)";
        ctx.fillStyle = `rgba(255, 176, 96, ${e.a})`;
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }

      frame = requestAnimationFrame(draw);
    };

    seed();
    frame = requestAnimationFrame(draw);

    const observer = new ResizeObserver(seed);
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [mounted, reduced, density]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
