import { getLocalStorage, request } from "@stacks/connect";
import { Cl, Pc, validateStacksAddress, type ClarityValue, type PostCondition } from "@stacks/transactions";
import {
  NAYORI_NEXT,
  NEXT_LIMITS,
  NEXT_SBTC_ASSET_NAME,
  nextEscrowContract,
  type ContractId,
  type NextAsset,
  type NextConfig,
} from "../../constants/nayori-next";
import type { NetworkName } from "../../constants/network";
import type { NextDecisionKind } from "./parse";
import {
  allowanceTargetContract,
  isNextContractPrincipal,
  type NextAllowanceTarget,
} from "./permissions";
import { selectStxAddressForNetwork } from "../wallet";

// Wallet payloads for every party action on the Nayori contracts. Every payload uses
// post-condition mode deny: funding and applying bind the signer to the exact amount it pays,
// and every contract payout binds the contract principal to its exact outflow. Calls that move
// no funds carry no post-conditions, so deny mode rejects any transfer at all.
// Parties sign directly (tx-sender), so no delegation setup is needed in the app.

export interface NextCallPayload {
  contract: ContractId;
  functionName: string;
  functionArgs: ClarityValue[];
  postConditions: PostCondition[];
  postConditionMode: "deny";
  network: NetworkName;
}

interface JobRef {
  asset: NextAsset;
  jobId: number;
}

function integer(value: number, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(
      max === Number.MAX_SAFE_INTEGER
        ? `${field} must be a whole number of at least ${min}.`
        : `${field} must be a whole number between ${min.toLocaleString("en-US")} and ${max.toLocaleString("en-US")}.`
    );
  }
  return value;
}

const jobIdOf = (jobId: number) => integer(jobId, "Job id", 1);

/** A standard (wallet) address on the configured network. */
export function isNextWalletAddress(value: string, network: NetworkName = NAYORI_NEXT.network) {
  const prefixes = network === "mainnet" ? ["SP", "SM"] : ["ST", "SN"];
  return (
    typeof value === "string" &&
    !value.includes(".") &&
    prefixes.some((prefix) => value.startsWith(prefix)) &&
    validateStacksAddress(value)
  );
}

function principal(value: string, field: string, config: NextConfig) {
  if (!isNextWalletAddress(value, config.network)) {
    throw new Error(`${field} must be a valid ${config.network} Stacks address.`);
  }
  return value;
}

/** A non-zero 32-byte digest as hex (with or without 0x). */
export function hash32(value: string, field = "Evidence hash"): ClarityValue {
  const hex = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex) || /^0+$/.test(hex)) {
    throw new Error(`${field} must be a non-zero 32-byte digest in hex.`);
  }
  return Cl.bufferFromHex(hex);
}

function decisionArg(decision: NextDecisionKind) {
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("The decision must be approve or reject.");
  }
  return Cl.uint(decision === "approve" ? 1 : 2);
}

function budgetOf(asset: NextAsset, budget: number) {
  const bounds = NEXT_LIMITS.budget[asset];
  return integer(budget, asset === "sbtc" ? "Budget in sats" : "Budget in micro-STX", bounds.min, bounds.max);
}

function depositOf(deposit: number) {
  const bounds = NEXT_LIMITS.applicationDeposit;
  return integer(deposit, "Deposit in sats", bounds.min, bounds.max);
}

/** Printable ASCII only: the contracts store string-ascii. */
export function isPrintableAscii(value: string) {
  return /^[\x20-\x7e]*$/.test(value);
}

function transfer(
  asset: NextAsset,
  from: string,
  amount: number,
  condition: "eq" | "lte",
  config: NextConfig
): PostCondition {
  const sender = Pc.principal(from);
  const sends = condition === "eq" ? sender.willSendEq(amount) : sender.willSendLte(amount);
  return asset === "stx" ? sends.ustx() : sends.ft(config.sbtcToken, NEXT_SBTC_ASSET_NAME);
}

function payload(
  config: NextConfig,
  contract: ContractId,
  functionName: string,
  functionArgs: ClarityValue[],
  postConditions: PostCondition[] = []
): NextCallPayload {
  return { contract, functionName, functionArgs, postConditions, postConditionMode: "deny", network: config.network };
}

function jobCall(functionName: string, ref: JobRef, config: NextConfig) {
  return payload(config, nextEscrowContract(ref.asset, config), functionName, [Cl.uint(jobIdOf(ref.jobId))]);
}

/** The escrow pays out exactly the job budget (winner net plus fee, or the full refund). */
function payout(
  functionName: string,
  ref: JobRef & { budget: number },
  config: NextConfig,
  extraArgs: ClarityValue[] = []
) {
  const contract = nextEscrowContract(ref.asset, config);
  const budget = budgetOf(ref.asset, ref.budget);
  return payload(
    config,
    contract,
    functionName,
    [Cl.uint(jobIdOf(ref.jobId)), ...extraArgs],
    [transfer(ref.asset, contract, budget, "eq", config)]
  );
}

// ---------------------------------------------------------------- escrow: client

export function buildCreateJob(
  input: {
    asset: NextAsset;
    evaluator: string;
    budget: number;
    deliveryBlocks: number;
    reviewBlocks: number;
    description: string;
    client?: string;
  },
  config: NextConfig = NAYORI_NEXT
) {
  const evaluator = principal(input.evaluator, "Evaluator", config);
  if (input.client && input.client === evaluator) {
    throw new Error("The evaluator must be a different wallet from the client.");
  }
  const budget = budgetOf(input.asset, input.budget);
  const delivery = integer(input.deliveryBlocks, "Delivery window", NEXT_LIMITS.deliveryBlocks.min, NEXT_LIMITS.deliveryBlocks.max);
  const review = integer(input.reviewBlocks, "Review window", NEXT_LIMITS.reviewBlocks.min, NEXT_LIMITS.reviewBlocks.max);
  const description = input.description.trim();
  if (!description) throw new Error("Enter a job description.");
  if (!isPrintableAscii(description)) {
    throw new Error("The description must use plain ASCII characters.");
  }
  if (description.length > NEXT_LIMITS.descriptionLength) {
    throw new Error(`The description must be at most ${NEXT_LIMITS.descriptionLength} characters.`);
  }
  return payload(config, nextEscrowContract(input.asset, config), "create-job", [
    Cl.principal(evaluator),
    Cl.uint(budget),
    Cl.uint(delivery),
    Cl.uint(review),
    Cl.stringAscii(description),
  ]);
}

/** The client moves exactly the job budget into escrow, and nothing else. */
export function buildFundJob(
  input: JobRef & { budget: number; sender: string },
  config: NextConfig = NAYORI_NEXT
) {
  const sender = principal(input.sender, "Client wallet", config);
  const budget = budgetOf(input.asset, input.budget);
  return payload(
    config,
    nextEscrowContract(input.asset, config),
    "fund-job",
    [Cl.uint(jobIdOf(input.jobId))],
    [transfer(input.asset, sender, budget, "eq", config)]
  );
}

/** The client offers the job to a provider; the offer can change until the provider accepts. */
export function buildNameProvider(
  input: JobRef & { provider: string; parties?: readonly (string | undefined)[] },
  config: NextConfig = NAYORI_NEXT
) {
  const provider = principal(input.provider, "Provider", config);
  if (input.parties?.some((party) => party === provider)) {
    throw new Error("The provider cannot be the client, evaluator, treasury or appeal authority.");
  }
  return payload(config, nextEscrowContract(input.asset, config), "name-provider", [
    Cl.uint(jobIdOf(input.jobId)),
    Cl.principal(provider),
  ]);
}

/** The client of a completed job rates the provider once (1 to 5). */
export function buildRateProvider(input: JobRef & { score: number }, config: NextConfig = NAYORI_NEXT) {
  const score = integer(input.score, "Rating", NEXT_LIMITS.rating.min, NEXT_LIMITS.rating.max);
  return payload(config, nextEscrowContract(input.asset, config), "rate-provider", [
    Cl.uint(jobIdOf(input.jobId)),
    Cl.uint(score),
  ]);
}

// ---------------------------------------------------------------- escrow: provider

export function buildAcceptJob(ref: JobRef, config: NextConfig = NAYORI_NEXT) {
  return jobCall("accept-job", ref, config);
}

export function buildSubmitWork(input: JobRef & { deliverable: Uint8Array }, config: NextConfig = NAYORI_NEXT) {
  const bytes = input.deliverable;
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > NEXT_LIMITS.deliverableBytes) {
    throw new Error(`The deliverable commitment must be 1 to ${NEXT_LIMITS.deliverableBytes} bytes.`);
  }
  return payload(config, nextEscrowContract(input.asset, config), "submit-work", [
    Cl.uint(jobIdOf(input.jobId)),
    Cl.buffer(bytes),
  ]);
}

// ---------------------------------------------------------------- escrow: evaluator

export function buildRecordDecision(
  input: JobRef & { decision: NextDecisionKind; evidenceHash: string },
  config: NextConfig = NAYORI_NEXT
) {
  return payload(config, nextEscrowContract(input.asset, config), "record-decision", [
    Cl.uint(jobIdOf(input.jobId)),
    decisionArg(input.decision),
    hash32(input.evidenceHash),
  ]);
}

// ---------------------------------------------------------------- escrow: losing party and authority

/** The client against an approval, the provider against a rejection. */
export function buildAppeal(input: JobRef & { evidenceHash: string }, config: NextConfig = NAYORI_NEXT) {
  return payload(config, nextEscrowContract(input.asset, config), "appeal", [
    Cl.uint(jobIdOf(input.jobId)),
    hash32(input.evidenceHash),
  ]);
}

/** The job's appeal authority; settles in the same call. */
export function buildResolveAppeal(
  input: JobRef & { budget: number; decision: NextDecisionKind; resolutionHash: string },
  config: NextConfig = NAYORI_NEXT
) {
  return payout("resolve-appeal", input, config, [
    decisionArg(input.decision),
    hash32(input.resolutionHash, "Resolution hash"),
  ]);
}

// ---------------------------------------------------------------- escrow: anyone

/** After the review window passes without a decision. */
export function buildRecordDefaultApproval(ref: JobRef, config: NextConfig = NAYORI_NEXT) {
  return jobCall("record-default-approval", ref, config);
}

/** After the appeal window, or an unresolved appeal's resolution window. */
export function buildSettleJob(input: JobRef & { budget: number }, config: NextConfig = NAYORI_NEXT) {
  return payout("settle-job", input, config);
}

/** No delivery by the deadline: the full budget goes back to the client. */
export function buildRefundNoDelivery(input: JobRef & { budget: number }, config: NextConfig = NAYORI_NEXT) {
  return payout("refund-no-delivery", input, config);
}

/** An unfunded job past its deadline closes. No funds move. */
export function buildCloseUnfunded(ref: JobRef, config: NextConfig = NAYORI_NEXT) {
  return jobCall("close-unfunded", ref, config);
}

/** Replays an outcome the reputation registry did not take at settlement. */
export function buildRetryReputation(ref: JobRef, config: NextConfig = NAYORI_NEXT) {
  return jobCall("retry-reputation", ref, config);
}

// ---------------------------------------------------------------- agents and applications

function agentArgs(input: { name: string; uri: string }) {
  const name = input.name.trim();
  const uri = input.uri.trim();
  if (!name) throw new Error("Enter an agent name.");
  if (!isPrintableAscii(name) || !isPrintableAscii(uri)) {
    throw new Error("The agent name and link must use plain ASCII characters.");
  }
  if (name.length > 64) throw new Error("The agent name must be at most 64 characters.");
  if (uri.length > 256) throw new Error("The agent link must be at most 256 characters.");
  return [Cl.stringAscii(name), Cl.stringAscii(uri)];
}

export function buildRegisterAgent(input: { name: string; uri: string }, config: NextConfig = NAYORI_NEXT) {
  return payload(config, config.contracts.agents, "register", agentArgs(input));
}

/** The registered wallet changes its agent's name and link. */
export function buildUpdateAgent(input: { name: string; uri: string }, config: NextConfig = NAYORI_NEXT) {
  return payload(config, config.contracts.agents, "update", agentArgs(input));
}

/**
 * A registered agent applies to an open sBTC job with a deposit. The applicant sends exactly
 * the deposit. On a full list the contract refunds the lowest entry in the same call; that entry
 * is always strictly below the new deposit, so the contract outflow is capped at the deposit.
 */
export function buildApplyToJob(
  input: { jobId: number; deposit: number; sender: string },
  config: NextConfig = NAYORI_NEXT
) {
  const sender = principal(input.sender, "Applicant wallet", config);
  const deposit = depositOf(input.deposit);
  const contract = config.contracts.applications;
  return payload(
    config,
    contract,
    "apply-to-job",
    [Cl.uint(jobIdOf(input.jobId)), Cl.uint(deposit)],
    [
      transfer("sbtc", sender, deposit, "eq", config),
      transfer("sbtc", contract, deposit, "lte", config),
    ]
  );
}

type RefundInput = { jobId: number; applicant: string; deposit: number };

function applicationRefund(
  functionName: "withdraw" | "decline" | "release",
  input: RefundInput,
  config: NextConfig
) {
  const applicant = principal(input.applicant, "Applicant", config);
  const deposit = depositOf(input.deposit);
  const contract = config.contracts.applications;
  const args = functionName === "withdraw"
    ? [Cl.uint(jobIdOf(input.jobId))]
    : [Cl.uint(jobIdOf(input.jobId)), Cl.principal(applicant)];
  return payload(config, contract, functionName, args, [
    transfer("sbtc", contract, deposit, "eq", config),
  ]);
}

/** The applicant takes its deposit back. */
export function buildWithdrawApplication(input: RefundInput, config: NextConfig = NAYORI_NEXT) {
  return applicationRefund("withdraw", input, config);
}

/** The client declines an applicant, who cannot reapply to that job; the deposit is returned. */
export function buildDeclineApplication(input: RefundInput, config: NextConfig = NAYORI_NEXT) {
  return applicationRefund("decline", input, config);
}

/** Anyone, once the job stops taking applications; the deposit is returned. */
export function buildReleaseApplication(input: RefundInput, config: NextConfig = NAYORI_NEXT) {
  return applicationRefund("release", input, config);
}

// ---------------------------------------------------------------- permissions (D4)

function helperOf(caller: string, config: NextConfig): ContractId {
  const value = caller.trim();
  if (!isNextContractPrincipal(value, config.network)) {
    throw new Error(`The helper must be a ${config.network} contract, like ${config.network === "mainnet" ? "SP" : "ST"}...name.`);
  }
  return value;
}

/** The wallet allows a helper contract to act for it on one Nayori contract, optionally until a block. */
export function buildAllowContractCaller(
  input: { caller: string; target: NextAllowanceTarget; until?: number },
  config: NextConfig = NAYORI_NEXT
) {
  const caller = helperOf(input.caller, config);
  const target = allowanceTargetContract(input.target, config);
  const until = input.until === undefined ? Cl.none() : Cl.some(Cl.uint(integer(input.until, "Expiry block", 1)));
  return payload(config, config.contracts.permissions, "allow-contract-caller", [
    Cl.principal(caller),
    Cl.principal(target),
    until,
  ]);
}

/** The wallet revokes a helper contract on one Nayori contract. */
export function buildDisallowContractCaller(
  input: { caller: string; target: NextAllowanceTarget },
  config: NextConfig = NAYORI_NEXT
) {
  const caller = helperOf(input.caller, config);
  const target = allowanceTargetContract(input.target, config);
  return payload(config, config.contracts.permissions, "disallow-contract-caller", [
    Cl.principal(caller),
    Cl.principal(target),
  ]);
}

// ---------------------------------------------------------------- signing

/** The connected wallet account for the Nayori contracts' network, or "". */
export function getNextConnectedAddress(): string {
  const addresses = getLocalStorage()?.addresses?.stx ?? [];
  return selectStxAddressForNetwork(addresses, NAYORI_NEXT.network);
}

/** Opens the connected wallet with the payload. The wallet enforces the post-conditions. */
export function sendNextCall(call: NextCallPayload) {
  return request("stx_callContract", { ...call } as any);
}

async function sha256Text(text: string, emptyMessage: string): Promise<Uint8Array> {
  const value = text.trim();
  if (!value) throw new Error(emptyMessage);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

/** SHA-256 of the provider's deliverable text, as the 32-byte on-chain commitment. */
export function deliverableCommitment(text: string): Promise<Uint8Array> {
  return sha256Text(text, "Add a deliverable link, CID or description.");
}

/** SHA-256 of free text as hex, used for decision, appeal and resolution notes. */
export async function textDigestHex(text: string): Promise<string> {
  const bytes = await sha256Text(text, "Add a short note that explains the evidence.");
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A 32-byte hex digest pasted as is, or the SHA-256 of a written note. */
export async function evidenceHashFrom(input: string): Promise<string> {
  const value = input.trim();
  const hex = value.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return hex.toLowerCase();
  return textDigestHex(value);
}
