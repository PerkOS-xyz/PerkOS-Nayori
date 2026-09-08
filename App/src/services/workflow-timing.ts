import { ClarityType, type ClarityValue } from "@stacks/transactions";

export interface TimingPolicy { workflowBurnBlocks: number; settlementBurnBlocks: number }
/** Advertised operator baseline. It does not modify a wallet, permit or contract. */
export function operatorTimingPolicy(network: "mainnet" | "testnet", workflow = "6", settlement = "6"): TimingPolicy {
  const min = network === "mainnet" ? 6 : 0;
  if (network !== "mainnet" && network !== "testnet") throw Error("invalid_network");
  if (![workflow, settlement].every(v => /^(0|[1-9][0-9]{0,2})$/.test(v) && Number(v) >= min && Number(v) <= 144) || Number(settlement) < Number(workflow)) throw Error("invalid_timing_policy");
  return { workflowBurnBlocks: Number(workflow), settlementBurnBlocks: Number(settlement) };
}
export function parseTimingWindow(cv: ClarityValue): number {
  if (cv.type !== ClarityType.ResponseOk || cv.value.type !== ClarityType.UInt) throw Error("timing_unavailable");
  const value = Number(cv.value.value);
  if (!Number.isSafeInteger(value) || value <= 0) throw Error("timing_unavailable");
  return value;
}
/** Timeout/finalize opens strictly AFTER the deadline; equality is still protected. */
export function deadlineProgress(deadline: number | undefined, burnHeight: number) {
  if (deadline === undefined) return null;
  if (!Number.isSafeInteger(deadline) || deadline < 1 || !Number.isSafeInteger(deadline + 1) || !Number.isSafeInteger(burnHeight) || burnHeight < 1) return null;
  const remainingBurnBlocks = Math.max(0, deadline + 1 - burnHeight);
  return { deadlineBurnHeight: deadline, eligibleAfterBurnHeight: deadline + 1, remainingBurnBlocks,
    estimatedSeconds: remainingBurnBlocks * 600, estimateIsGuarantee: false as const,
    deadlinePassed: burnHeight > deadline };
}
export function estimatedDuration(blocks: number): string {
  if (blocks === 0) return "No additional Bitcoin-block wait";
  const minutes = blocks * 10;
  return `~${minutes < 60 ? `${minutes} min` : `${Number((minutes / 60).toFixed(1))} h`} estimated; not guaranteed`;
}
