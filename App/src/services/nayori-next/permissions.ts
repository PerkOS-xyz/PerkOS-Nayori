import { validateStacksAddress } from "@stacks/transactions";
import type { NetworkName } from "../../constants/network";
import type { ContractId, NextConfig } from "../../constants/nayori-next";
import type { NextAllowance } from "./parse";

// Delegation on the next Nayori contracts (DECISIONS D4). A party can allow a helper contract
// to act for it on one Nayori contract, optionally until a Bitcoin block. Allowing and revoking
// are always direct calls from the party's wallet. Allowances have no index, so the app checks
// one helper and target at a time instead of listing them.

/** The Nayori contracts that accept an allowed helper. */
export const NEXT_ALLOWANCE_TARGETS = [
  { key: "escrowSbtc", label: "sBTC escrow" },
  { key: "escrowStx", label: "STX escrow" },
  { key: "applications", label: "Applications" },
  { key: "agents", label: "Agent registry" },
] as const;

export type NextAllowanceTarget = (typeof NEXT_ALLOWANCE_TARGETS)[number]["key"];

export function isAllowanceTarget(value: string): value is NextAllowanceTarget {
  return NEXT_ALLOWANCE_TARGETS.some((target) => target.key === value);
}

export function allowanceTargetLabel(target: NextAllowanceTarget): string {
  return NEXT_ALLOWANCE_TARGETS.find((entry) => entry.key === target)?.label ?? target;
}

export function allowanceTargetContract(target: NextAllowanceTarget, config: NextConfig): ContractId {
  if (!isAllowanceTarget(target)) throw new Error("Choose the Nayori contract the helper may act on.");
  return config.contracts[target];
}

const CONTRACT_NAME = /^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/;

/** A contract principal (address.contract-name) on the given network. */
export function isNextContractPrincipal(value: string, network: NetworkName): value is ContractId {
  if (typeof value !== "string") return false;
  const parts = value.trim().split(".");
  if (parts.length !== 2) return false;
  const [address, name] = parts;
  const prefixes = network === "mainnet" ? ["SP", "SM"] : ["ST", "SN"];
  return prefixes.some((prefix) => address.startsWith(prefix)) && validateStacksAddress(address) && CONTRACT_NAME.test(name);
}

/**
 * The optional expiry block. Empty means no expiry. An allowance is active while the Bitcoin
 * height is below it, so a block at or below the current height would end it at once.
 */
export function parseExpiryBlock(input: string, height: number): number | undefined {
  const value = input.trim();
  if (!value) return undefined;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("The expiry must be a Bitcoin block number, or empty for no expiry.");
  }
  const block = Number(value);
  if (height > 0 && block <= height) {
    throw new Error(`The expiry must be after the current Bitcoin block (${height.toLocaleString("en-US")}).`);
  }
  if (block === 0) throw new Error("The expiry must be after the current Bitcoin block.");
  return block;
}

export type AllowanceState = "not-allowed" | "active" | "expired";

/** Mirrors `is-allowed`: active with no expiry, or while the height is below the expiry block. */
export function allowanceState(allowance: NextAllowance | null, height: number): AllowanceState {
  if (!allowance) return "not-allowed";
  if (allowance.until === undefined) return "active";
  return height > 0 && height >= allowance.until ? "expired" : "active";
}

export function allowanceSummary(allowance: NextAllowance | null, height: number): string {
  const state = allowanceState(allowance, height);
  if (state === "not-allowed") return "Not allowed. This helper cannot act for you on that contract.";
  const until = allowance?.until;
  if (until === undefined) return "Allowed, with no expiry. Revoke it when you no longer need it.";
  const block = until.toLocaleString("en-US");
  return state === "expired"
    ? `Expired at Bitcoin block ${block}. It no longer acts for you; revoking clears it.`
    : `Allowed until Bitcoin block ${block}.`;
}
