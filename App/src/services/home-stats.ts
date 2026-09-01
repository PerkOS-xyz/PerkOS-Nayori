import type { ObservedTransparencyMetrics, TransparencySnapshot } from "./transparency";

export const HOME_TRANSPARENCY_METRICS = [
  { key: "registeredAgentsMainnet", label: "Registered agents" },
  { key: "totalJobsMainnet", label: "All jobs" },
  { key: "successfulContractCalls", label: "Successful contract calls" },
  { key: "distinctWallets", label: "Distinct on-chain wallets" },
] as const satisfies readonly {
  key: keyof ObservedTransparencyMetrics;
  label: string;
}[];

export type HomeTransparencyStat = {
  value: number;
  label: string;
};

export function homeStatsFromSnapshot(
  snapshot: Pick<TransparencySnapshot, "dataStatus" | "observed">,
): HomeTransparencyStat[] | null {
  if (snapshot.dataStatus.chain !== "live" || !snapshot.observed) return null;
  return HOME_TRANSPARENCY_METRICS.map(({ key, label }) => ({
    label,
    value: snapshot.observed![key],
  }));
}
