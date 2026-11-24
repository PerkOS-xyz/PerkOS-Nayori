import type { NextAsset } from "../../constants/nayori-deployment";

// The two contract sets the read-only pages combine: the live Nayori contracts (nayori-escrow-sbtc,
// nayori-escrow-stx, nayori-agents, nayori-applications, nayori-reputation) and the earlier ones
// (sbtc-commerce, agentic-commerce, agent-registry, reputation-registry). Plain data and string
// helpers only, so any page or server module can import it without the Stacks SDK.

export type ContractSet = "nayori" | "earlier";

export const CONTRACT_SETS: readonly ContractSet[] = ["nayori", "earlier"];

export const CONTRACT_SET_LABELS: Record<ContractSet, string> = {
  nayori: "Nayori contracts",
  earlier: "Earlier contracts",
};

/** Job detail link on the Nayori contracts. */
export const nextJobHref = (id: number, asset: NextAsset) => `/jobs/next/${id}?asset=${asset}`;

/** Job detail link on the earlier contracts. */
export const earlierJobHref = (id: number, currency: NextAsset) => `/jobs/${id}?currency=${currency}`;

export const jobHrefFor = (set: ContractSet, id: number, asset: NextAsset) =>
  set === "nayori" ? nextJobHref(id, asset) : earlierJobHref(id, asset);

/** Short contract label for charts: drops the deployer and the `nayori-` prefix. */
export function shortContractName(name: string): string {
  const bare = name.includes(".") ? name.split(".")[1] : name;
  return bare.replace(/^nayori-/, "");
}
