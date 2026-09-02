'use client';

import { useRef, useState } from "react";
import { MODELS } from "./landingData";
import { useLgUp } from "./useMdUp";
import { useMounted } from "./useMounted";
import { useSectionProgress } from "./useSectionProgress";

// The first swap fires early on purpose: with an even split the opening third
// of the runway scrolls with nothing happening, and people notice.
const SWAP_AT = 0.38;

/**
 * The two economic models, as one pinned stage that swaps.
 *
 * The stage now runs at every viewport. On phones the alternative was a very
 * long column — the same content read twice as far — so the pin earns its
 * keep more there than on desktop; the runway is just shorter, because mobile
 * scroll patience is a fraction of desktop's.
 *
 * Before hydration the markup is the plain stacked version: both models in
 * normal flow, fully visible, no absolute positioning. That is what the server
 * sends and what any client without JavaScript keeps.
 */
export default function ModelsDeck() {
  const sectionRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  const lgUp = useLgUp();
  const [active, setActive] = useState(0);

  // Discrete visibility beats per-frame opacity math: one integer slot, changed
  // only when it actually changes, so no stage is ever left half-painted.
  useSectionProgress(sectionRef, (progress) => {
    const next = progress < SWAP_AT ? 0 : 1;
    setActive((current) => (current === next ? current : next));
    if (railRef.current) {
      railRef.current.style.transform = `scaleY(${progress})`;
    }
  });

  const staged = mounted;

  return (
    <section
      ref={sectionRef}
      className={`relative mt-f5 ${staged ? "h-[135vh] sm:h-[165vh] lg:h-[240vh]" : ""}`}
    >
      <div
        className={
          staged
            ? "sticky top-0 flex h-screen items-center supports-[height:100svh]:h-[100svh]"
            : ""
        }
      >
        <div className="container-x w-full">
          <div className="max-w-2xl" data-nayori-reveal>
            <span className="kicker">Two economic models</span>
            <h2 className="mt-f3 text-h2 font-bold text-white">
              One identity. Two ways to get paid.
            </h2>
          </div>

          <div className="mt-f4 grid gap-f3 lg:mt-f5 lg:grid-cols-12 lg:gap-f4">
            {/* Desktop index with the scrubbed rail. */}
            <div className="relative hidden lg:col-span-4 lg:block lg:self-start">
              <div className="absolute left-0 top-0 h-full w-0.5 overflow-hidden bg-white/10">
                <div
                  ref={railRef}
                  className="h-full w-full origin-top bg-gradient-to-b from-brand-300 to-brand"
                  style={{ transform: "scaleY(0)" }}
                />
              </div>
              <ol aria-hidden="true">
                {MODELS.map((model, index) => {
                  const on = lgUp && index === active;
                  return (
                    <li
                      key={model.id}
                      className={`py-f2 pl-f3 transition-all duration-300 ease-signature ${
                        on ? "text-white" : "text-mist-500"
                      }`}
                    >
                      <span className="font-mono text-micro">0{index + 1}</span>
                      <p className="mt-1 text-h3 font-semibold">{model.name}</p>
                      <p
                        className={`mt-1 text-micro transition-opacity duration-300 ease-signature ${
                          on ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        {model.when}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Compact stage indicator, for the viewports without the index. */}
            {staged && (
              <div className="flex items-center gap-2 lg:hidden" aria-hidden="true">
                {MODELS.map((model, index) => (
                  <span
                    key={model.id}
                    className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ease-signature ${
                      index === active ? "bg-brand" : "bg-white/12"
                    }`}
                  />
                ))}
              </div>
            )}

            <div
              className={`relative lg:col-span-8 ${
                staged ? "h-[29rem] sm:h-[23rem] lg:h-[400px]" : "space-y-f5"
              }`}
            >
              {MODELS.map((model, index) => (
                <article
                  key={model.id}
                  data-active={staged ? index === active : true}
                  className={
                    staged
                      ? "absolute inset-0 transition-opacity duration-300 ease-signature"
                      : ""
                  }
                  style={
                    staged
                      ? {
                          opacity: index === active ? 1 : 0,
                          pointerEvents: index === active ? "auto" : "none",
                        }
                      : undefined
                  }
                >
                  <h3 className="text-h3 font-semibold text-white lg:hidden">{model.name}</h3>
                  <p className="mt-1 text-micro text-mist-300 lg:hidden">{model.when}</p>

                  {/* The grid keeps its hairlines painted at all times; only the
                      contents of each cell animate, so no empty cell ever shows
                      through as a grey block. */}
                  <ol className="nayori-steps mt-f3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] lg:mt-0">
                    {model.steps.map((step, stepIndex) => (
                      <li key={step.n} className="relative bg-ink-950 p-f2 sm:p-f3">
                        <span
                          aria-hidden="true"
                          className="nayori-step-rule absolute inset-x-0 top-0 h-px bg-brand/40"
                        />
                        <div
                          className="nayori-step"
                          style={{ ["--nayori-step-delay" as string]: `${stepIndex * 90}ms` }}
                        >
                          <span className="font-mono text-micro text-brand-400">{step.n}</span>
                          <p className="mt-f1 text-body font-semibold text-white sm:text-h3">
                            {step.title}
                          </p>
                          <p className="mt-1 text-micro leading-relaxed text-mist-300">
                            {step.desc}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <p className="mt-f2 text-micro text-mist-500">{model.footnote}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
