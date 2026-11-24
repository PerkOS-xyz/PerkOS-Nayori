import { STACKS_MAINNET, STACKS_TESTNET, type StacksNetwork } from "@stacks/network";
import { validateStacksAddress } from "@stacks/transactions";
import { hiroFetch } from "../services/hiro-fetch";
import { NETWORK_NAME, type NetworkName } from "./network";
import {
  NEXT_DEPLOYERS,
  NEXT_SBTC_TOKENS,
  nextContractIds,
  type ContractId,
  type NextAsset,
  type NextContractKey,
} from "./nayori-deployment";

// The Nayori contracts (nayori-escrow-sbtc, nayori-escrow-stx, nayori-applications, nayori-agents,
// nayori-reputation, nayori-permissions, nayori-roles), live on mainnet and testnet since
// 2026-11-24 (Clarity 6). Every new job uses them. The deployer holds no powers: the treasury and
// the appeal authority live in nayori-roles and each job pins the holders at creation.

export {
  NEXT_CONTRACT_NAMES,
  NEXT_DEPLOYERS,
  NEXT_ROLE_HOLDERS,
  NEXT_SBTC_ASSET_NAME,
  NEXT_SBTC_TOKENS,
  isMultisigAddress,
  nextContractIds,
  nextEscrowAsset,
} from "./nayori-deployment";
export type { ContractId, NextAsset, NextContractKey } from "./nayori-deployment";

export interface NextConfig {
  network: NetworkName;
  deployer: string;
  contracts: Record<NextContractKey, ContractId>;
  sbtcToken: ContractId;
}

export interface NextConfigEnv {
  /** Optional override; it must equal the reviewed deployer of the network. */
  deployer?: string;
}

/** Pure resolver so tests can check every branch without reloading modules. */
export function resolveNextConfig(
  env: NextConfigEnv = {},
  network: NetworkName = NETWORK_NAME
): NextConfig {
  const pinned = NEXT_DEPLOYERS[network];
  const override = (env.deployer ?? "").trim();
  if (override) {
    if (override.includes(".") || !validateStacksAddress(override)) {
      throw new Error(
        `NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER (${override}) must be a standard Stacks address`
      );
    }
    if (override !== pinned) {
      throw new Error(
        `NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER (${override}) is not the reviewed ${network} deployer ${pinned}`
      );
    }
  }
  return { network, deployer: pinned, contracts: nextContractIds(network), sbtcToken: NEXT_SBTC_TOKENS[network] };
}

export const NAYORI_NEXT = resolveNextConfig({
  deployer: process.env.NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER,
});

export function nextEscrowContract(asset: NextAsset, config: NextConfig = NAYORI_NEXT): ContractId {
  return asset === "sbtc" ? config.contracts.escrowSbtc : config.contracts.escrowStx;
}

const baseNextNetwork: StacksNetwork =
  NAYORI_NEXT.network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
/** Network for read-only calls to these contracts; it follows the app network. */
export const NEXT_STACKS_NETWORK: StacksNetwork = {
  ...baseNextNetwork,
  client: { ...baseNextNetwork.client, fetch: hiroFetch },
};
export const NEXT_HIRO_API =
  NAYORI_NEXT.network === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";

/** Bounds fixed in the contracts. Blocks are Bitcoin (burn) blocks. */
export const NEXT_LIMITS = {
  budget: {
    sbtc: { min: 1_000, max: 100_000_000 },
    stx: { min: 1_000_000, max: 100_000_000_000 },
  },
  deliveryBlocks: { min: 144, max: 4_320 },
  reviewBlocks: { min: 12, max: 1_008 },
  appealBlocks: 144,
  feeDivisor: 50,
  applicationDeposit: { min: 100, max: 1_000_000 },
  maxApplications: 50,
  rating: { min: 1, max: 5 },
  descriptionLength: 512,
  deliverableBytes: 64,
} as const;
