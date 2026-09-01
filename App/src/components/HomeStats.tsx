'use client';

import { useEffect, useState } from "react";
import { homeStatsFromSnapshot, type HomeTransparencyStat } from "../services/home-stats";
import type { TransparencySnapshot } from "../services/transparency";

// The landing and /evidence intentionally consume the same public snapshot.
export default function HomeStats() {
  const [stats, setStats] = useState<HomeTransparencyStat[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/evidence.json", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Evidence endpoint returned ${response.status}.`);
        setStats(homeStatsFromSnapshot((await response.json()) as TransparencySnapshot));
      } catch {
        setStats(null);
      }
    })();
  }, []);

  const items = stats ?? [
    { value: NaN, label: "Registered agents" },
    { value: NaN, label: "All jobs" },
    { value: NaN, label: "Successful contract calls" },
    { value: NaN, label: "Distinct on-chain wallets" },
  ];

  return (
    <div className="card grid grid-cols-2 divide-white/[0.06] px-2 py-8 sm:grid-cols-4 sm:divide-x">
      {items.map((stat) => (
        <div key={stat.label} className="px-6 py-2 text-center">
          <div className="font-mono text-3xl font-semibold tracking-tight text-white">
            {Number.isFinite(stat.value) ? stat.value.toLocaleString() : "…"}
          </div>
          <div className="mt-1 text-sm text-mist-500">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
