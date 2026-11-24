import type { NetworkName } from "./network";

// Plain data about the live Nayori deployment, free of SDK imports so the edge middleware (through
// the discovery documents) can use it. constants/nayori-next re-exports everything here.

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

export function nextContractIds(network: NetworkName): Record<NextContractKey, ContractId> {
  const deployer = NEXT_DEPLOYERS[network];
  return Object.fromEntries(
    (Object.keys(NEXT_CONTRACT_NAMES) as NextContractKey[]).map((key) => [
      key,
      `${deployer}.${NEXT_CONTRACT_NAMES[key]}`,
    ])
  ) as Record<NextContractKey, ContractId>;
}

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
