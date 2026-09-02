'use client';

import { useEffect, useState } from "react";
import { HOME_TRANSPARENCY_METRICS, homeStatsFromSnapshot } from "../../services/home-stats";
import type { TransparencySnapshot } from "../../services/transparency";

const SHORT_LABELS: Record<string, string> = {
  registeredAgentsMainnet: "agents registered",
  totalJobsMainnet: "jobs created",
  successfulContractCalls: "successful contract calls",
  distinctWallets: "distinct wallets",
};

/**
 * Live mainnet counters as a market tape, sitting on the seam where the hero
 * art ends and the page begins.
 *
 * A tape suits this data better than a stat grid: it is a running record, and
 * a number that scrolls past reads as activity rather than as a scoreboard.
 * The motion is time-based, so it keeps running while the sections above are
 * pinned.
 */
export default function LiveTicker() {
  const [values, setValues] = useState<number[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/evidence.json", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Evidence endpoint returned ${response.status}.`);
        const stats = homeStatsFromSnapshot((await response.json()) as TransparencySnapshot);
        setValues(stats ? stats.map((stat) => stat.value) : null);
      } catch {
        setValues(null);
      }
    })();
  }, []);

  const items = HOME_TRANSPARENCY_METRICS.map((metric, index) => ({
    key: metric.key,
    label: SHORT_LABELS[metric.key] ?? metric.label,
    value: values ? values[index].toLocaleString() : "—",
  }));

  return (
    <div className="relative border-y border-white/[0.08] bg-ink-950">
      {/* Static, readable copy for assistive tech and for anything that does
          not run the animation. */}
      <dl className="sr-only">
        {items.map((item) => (
          <div key={item.key}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center">
        <span className="relative z-10 flex shrink-0 items-center gap-2 border-r border-white/[0.08] bg-ink-950 py-f2 pl-6 pr-f2 sm:pr-f3 lg:pl-[max(1.5rem,calc((100vw-1180px)/2))]">
          <span className="relative flex h-1.5 w-1.5">
            <span
              aria-hidden="true"
              className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70 motion-reduce:animate-none"
            />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-mist-500 sm:inline">
            Stacks mainnet
          </span>
        </span>

        <div
          aria-hidden="true"
          className="nayori-ticker-mask relative flex-1 overflow-hidden py-f2"
        >
          <div className="nayori-ticker-track flex w-max items-baseline">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-baseline">
                {items.map((item) => (
                  <span key={`${copy}-${item.key}`} className="flex items-baseline gap-2 px-f3">
                    <span className="font-mono text-body font-semibold tabular-nums text-white">
                      {item.value}
                    </span>
                    <span className="font-mono text-micro text-mist-500">{item.label}</span>
                    <span className="ml-f3 h-1 w-1 rotate-45 bg-brand/50" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
