import { STACKS_MAINNET, STACKS_TESTNET, type StacksNetwork } from "@stacks/network";
import { validateStacksAddress } from "@stacks/transactions";
import { hiroFetch } from "../services/hiro-fetch";
import { NETWORK_NAME, type NetworkName } from "./network";

// The Nayori contracts (nayori-escrow-sbtc, nayori-escrow-stx, nayori-applications, nayori-agents,
// nayori-reputation, nayori-permissions, nayori-roles), live on mainnet and testnet since
// 2026-11-24 (Clarity 6). Every new job uses them. The deployer holds no powers: the treasury and
// the appeal authority live in nayori-roles and each job pins the holders at creation.

export type NextAsset = "sbtc" | "stx";

export const NEXT_CONTRACT_NAMES = {
  permissions: "nayori-permissions",
  roles: "nayori-roles",
  reputation: "nayori-reputation",
  escrowSbtc: "nayori-escrow-sbtc",
  escrowStx: "nayori-escrow-stx",
  agents: "nayori-agents",
  applications: "nayori-applications",
} as const;

export type NextContractKey = keyof typeof NEXT_CONTRACT_NAMES;
export type ContractId = `${string}.${string}`;

/** The reviewed deployer of the live contracts on each network. */
export const NEXT_DEPLOYERS: Record<NetworkName, string> = {
  mainnet: "SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X",
  testnet: "ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY",
};

/**
 * Role holders in nayori-roles at deployment. On mainnet both are Leather multisig accounts
 * (2 of 2). Jobs pin the holders at creation, so always read the job for the authority of a job.
 */
export const NEXT_ROLE_HOLDERS: Record<NetworkName, { treasury: string; appealAuthority: string }> = {
  mainnet: {
    treasury: "SMFE58EKCK5ZPD7YCYM1CQY7K3H8SEXQH7C3YT8S",
    appealAuthority: "SM3950RVR364J25ZRFFNHB5TCNJ7VKPKKGD4N2RP9",
  },
  testnet: {
    treasury: "STHV38DZX23VB42EX9PE44S3WCC20DNC3V62T4N3",
    appealAuthority: "ST12SP3EXFGP6GNK0WJ9GKJ2NSHE9243MHG4JBHPS",
  },
};

// Canonical sBTC the escrow and applications contracts call internally. Only wallet
// post-conditions reference it; the contracts take no token parameter.
export const NEXT_SBTC_TOKENS: Record<NetworkName, ContractId> = {
  mainnet: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
  testnet: "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token",
};
export const NEXT_SBTC_ASSET_NAME = "sbtc-token";

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
  const contracts = Object.fromEntries(
    (Object.keys(NEXT_CONTRACT_NAMES) as NextContractKey[]).map((key) => [
      key,
      `${pinned}.${NEXT_CONTRACT_NAMES[key]}`,
    ])
  ) as Record<NextContractKey, ContractId>;
  return { network, deployer: pinned, contracts, sbtcToken: NEXT_SBTC_TOKENS[network] };
}

export const NAYORI_NEXT = resolveNextConfig({
  deployer: process.env.NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER,
});

/** True when the address is a multisig account (SM on mainnet, SN on testnet). */
export function isMultisigAddress(value?: string | null): boolean {
  return /^S[MN]/i.test(value ?? "");
}

/** The escrow asset of a contract id of the live deployment, or null for any other contract. */
export function nextEscrowAsset(contract: string, network: NetworkName): NextAsset | null {
  const deployer = NEXT_DEPLOYERS[network];
  if (contract === `${deployer}.${NEXT_CONTRACT_NAMES.escrowSbtc}`) return "sbtc";
  if (contract === `${deployer}.${NEXT_CONTRACT_NAMES.escrowStx}`) return "stx";
  return null;
}

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
