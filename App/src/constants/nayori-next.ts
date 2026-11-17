import { STACKS_MAINNET, STACKS_TESTNET, type StacksNetwork } from "@stacks/network";
import { validateStacksAddress } from "@stacks/transactions";
import { hiroFetch } from "../services/hiro-fetch";
import { NETWORK_NAME, type NetworkName } from "./network";

// Next Nayori contract generation (nayori-escrow-sbtc, nayori-escrow-stx, nayori-applications,
// nayori-agents, nayori-reputation, nayori-permissions, nayori-roles). Off by default: with no
// deployer configured the next-generation pages return 404 and nothing else in the app changes.

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

// Canonical sBTC the next escrow and applications contracts call internally. Only wallet
// post-conditions reference it; the contracts take no token parameter.
export const NEXT_SBTC_TOKENS: Record<NetworkName, ContractId> = {
  mainnet: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
  testnet: "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token",
};
export const NEXT_SBTC_ASSET_NAME = "sbtc-token";

// The Stacks boot addresses can never hold these contracts; the SDK uses them as placeholders.
const PLACEHOLDER_DEPLOYERS = new Set([
  "SP000000000000000000002Q6VF78",
  "ST000000000000000000002AMW42H",
]);

export interface NextConfig {
  enabled: boolean;
  network: NetworkName;
  deployer: string;
  contracts: Record<NextContractKey, ContractId>;
  sbtcToken: ContractId;
}

export interface NextConfigEnv {
  deployer?: string;
  network?: string;
}

/** Pure resolver so tests can check every branch without reloading modules. */
export function resolveNextConfig(
  env: NextConfigEnv,
  appNetwork: NetworkName = NETWORK_NAME
): NextConfig {
  const deployer = (env.deployer ?? "").trim();
  const rawNetwork = (env.network ?? "").trim();
  if (rawNetwork && rawNetwork !== "mainnet" && rawNetwork !== "testnet") {
    throw new Error(
      `NEXT_PUBLIC_NAYORI_NEXT_NETWORK (${rawNetwork}) must be "mainnet" or "testnet"`
    );
  }
  const network = (rawNetwork || appNetwork) as NetworkName;
  if (deployer) {
    if (deployer.includes(".") || !validateStacksAddress(deployer)) {
      throw new Error(
        `NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER (${deployer}) must be a standard Stacks address`
      );
    }
    const expectedPrefix = network === "mainnet" ? "SP" : "ST";
    if (!deployer.startsWith(expectedPrefix)) {
      throw new Error(
        `NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER (${deployer}) does not match ${network}`
      );
    }
    if (PLACEHOLDER_DEPLOYERS.has(deployer)) {
      throw new Error(
        "NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER is a placeholder; set the real deployer"
      );
    }
  }
  const contracts = Object.fromEntries(
    (Object.keys(NEXT_CONTRACT_NAMES) as NextContractKey[]).map((key) => [
      key,
      `${deployer || "unset"}.${NEXT_CONTRACT_NAMES[key]}`,
    ])
  ) as Record<NextContractKey, ContractId>;
  return {
    enabled: Boolean(deployer),
    network,
    deployer,
    contracts,
    sbtcToken: NEXT_SBTC_TOKENS[network],
  };
}

export const NAYORI_NEXT = resolveNextConfig({
  deployer: process.env.NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER,
  network: process.env.NEXT_PUBLIC_NAYORI_NEXT_NETWORK,
});
export const NAYORI_NEXT_ENABLED = NAYORI_NEXT.enabled;

export function assertNextEnabled(config: NextConfig = NAYORI_NEXT) {
  if (!config.enabled) {
    throw new Error("The next Nayori contracts are not enabled in this deployment.");
  }
}

export function nextEscrowContract(asset: NextAsset, config: NextConfig = NAYORI_NEXT): ContractId {
  return asset === "sbtc" ? config.contracts.escrowSbtc : config.contracts.escrowStx;
}

const baseNextNetwork: StacksNetwork =
  NAYORI_NEXT.network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
/** Network for next-generation read-only calls; it may differ from the main app network. */
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
