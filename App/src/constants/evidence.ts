import { MAINNET_DEPLOYER } from "./discovery";

export const EVIDENCE_VERSION = 2;
export const EVIDENCE_UPDATED_AT = "2026-08-28T00:00:00.000Z";

export const milestone2Targets = {
  registeredAgentsMainnet: 10,
  completedSbtcJobsMainnet: 5,
  completedJobsFromNonTeamWallets: 5,
  participatingNonTeamWallets: 2,
  externalSdkAdoptions: 1,
  sdkPublicDistribution: true,
} as const;

export const evidenceWallets = [
  {
    address: MAINNET_DEPLOYER,
    classification: "team" as const,
    roles: ["client", "deployer", "rater"],
  },
  {
    address: "SP1VY24ADP27HERH4XMQTK44XB9QX4ZASPMPJKPVF",
    classification: "team" as const,
    roles: ["evaluator"],
  },
  {
    address: "SP3DQCVZ26XCDGZFYB4TXJC6TMMZAVXZTER1DP8HV",
    classification: "team" as const,
    roles: ["provider"],
  },
] as const;

export type EvidenceWalletClassification =
  | "team"
  | "external-attested"
  | "unattested";

export const m2Baseline = {
  registeredAgentsMainnet: 1,
  completedSbtcJobsMainnet: 1,
} as const;

export const externalSdkAdoptions = [] as const;

export function classifyEvidenceWallet(address?: string): EvidenceWalletClassification {
  if (!address) return "unattested";
  const normalized = address.toUpperCase();
  return (
    evidenceWallets.find((wallet) => wallet.address.toUpperCase() === normalized)
      ?.classification ?? "unattested"
  );
}

export const m1SbtcLifecycle = [
  {
    step: 1,
    function: "create-job",
    label: "Job created",
    txId: "0x1319fcf70575baa1f4beb273cd0ec7194df2668a6e5681ee61c2183b83d3a675",
    sender: MAINNET_DEPLOYER,
    blockHeight: 8650816,
    confirmedAt: "2026-07-28T07:34:00.000Z",
  },
  {
    step: 2,
    function: "set-budget",
    label: "10,000 sat budget set",
    txId: "0x8be6bb3915d72bb2d74132a36b1b7b608fdac9326bb07da1fef91637db1661d0",
    sender: MAINNET_DEPLOYER,
    blockHeight: 8650819,
    confirmedAt: "2026-07-28T07:34:40.000Z",
  },
  {
    step: 3,
    function: "fund-job",
    label: "10,000 sats escrowed",
    txId: "0xaf4129fe46fc913fda7b9fa87543f05fc5f4430b9b5f26a46f9c3032ea0fcbd4",
    sender: MAINNET_DEPLOYER,
    blockHeight: 8650821,
    confirmedAt: "2026-07-28T07:35:07.000Z",
  },
  {
    step: 4,
    function: "assign-provider",
    label: "Provider assigned",
    txId: "0x0993f5bd4bb1524db673d42960560cf558ec9bef18ccdf78ff562aa7a2598ee2",
    sender: MAINNET_DEPLOYER,
    blockHeight: 8650823,
    confirmedAt: "2026-07-28T07:35:40.000Z",
  },
  {
    step: 5,
    function: "submit-work",
    label: "Work submitted",
    txId: "0xed2436fd7ed908b88ceafd3eefc79c875d4e45931382fa0eb94dffc7516e7720",
    sender: "SP3DQCVZ26XCDGZFYB4TXJC6TMMZAVXZTER1DP8HV",
    blockHeight: 8650826,
    confirmedAt: "2026-07-28T07:36:44.000Z",
  },
  {
    step: 6,
    function: "complete-job",
    label: "Provider paid 10,000 sats",
    txId: "0xf1a4fb78182262fb68c706e66374827550701b6d5dbccdc607588b1f0c951539",
    sender: "SP1VY24ADP27HERH4XMQTK44XB9QX4ZASPMPJKPVF",
    blockHeight: 8650830,
    confirmedAt: "2026-07-28T07:37:36.000Z",
  },
  {
    step: 7,
    function: "rate-provider",
    label: "Provider rated",
    txId: "0x05aadbdb1dccf98c353bd7974a562b1ecf477e99639449f8f43b3d62d0259000",
    sender: MAINNET_DEPLOYER,
    blockHeight: 8650832,
    confirmedAt: "2026-07-28T07:38:19.000Z",
  },
] as const;

export const evidenceManifest = {
  schemaVersion: EVIDENCE_VERSION,
  updatedAt: EVIDENCE_UPDATED_AT,
  product: "Nayori by PerkOS",
  network: "stacks:1",
  explorer: "https://explorer.hiro.so",
  policy: {
    externalWalletRule:
      "A wallet counts as external only after explicit non-team attestation; address uniqueness alone is never sufficient.",
    baselineRule:
      "Approved Milestone 1 transactions are public product evidence but do not count toward Milestone 2 external-adoption requirements.",
  },
  milestone1: {
    status: "approved",
    contract: `${MAINNET_DEPLOYER}.sbtc-commerce`,
    jobId: "1",
    asset: "sBTC",
    amountSats: 10_000,
    completedJobs: 1,
    wallets: evidenceWallets,
    lifecycle: m1SbtcLifecycle,
  },
  milestone2: {
    status: "in-progress",
    baseline: m2Baseline,
    targets: milestone2Targets,
    verified: {
      registeredAgentsMainnet: 0,
      completedSbtcJobsMainnet: 0,
      completedJobsFromNonTeamWallets: 0,
      participatingNonTeamWallets: 0,
      externalSdkAdoptions: 0,
      sdkPublicDistribution: true,
    },
    distribution: {
      npm: "https://www.npmjs.com/package/@perkos/agent-sdk",
      repository: "https://github.com/PerkOS-xyz/PerkOS-Nayori-Agent-SDK",
    },
    externalSdkAdoptions,
  },
} as const;

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function evidenceTransactionsCsv(): string {
  const header = [
    "milestone",
    "step",
    "label",
    "contract_function",
    "sender",
    "wallet_classification",
    "block_height",
    "confirmed_at",
    "txid",
    "explorer",
  ];
  const walletClass = new Map(
    evidenceWallets.map((wallet) => [wallet.address, wallet.classification]),
  );
  const rows = m1SbtcLifecycle.map((transaction) => [
    "M1-baseline",
    transaction.step,
    transaction.label,
    transaction.function,
    transaction.sender,
    walletClass.get(transaction.sender) ?? "unattested",
    transaction.blockHeight,
    transaction.confirmedAt,
    transaction.txId,
    `https://explorer.hiro.so/txid/${transaction.txId}?chain=mainnet`,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
