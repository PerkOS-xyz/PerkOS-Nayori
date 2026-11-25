import { isMultisigAddress } from "../../constants/nayori-next";
import { txIdOf } from "../tx";

/** Where the other member of a Leather multisig account approves a proposed transaction. */
export const LEATHER_MULTISIG_URL = "https://leather.io/multisig";

export type WalletOutcome =
  | { kind: "broadcast"; txid: string }
  | { kind: "proposal"; txid?: string }
  | { kind: "missing" };

/**
 * What the wallet answer means for the signer. A Leather multisig account (SM on mainnet, SN on
 * testnet) turns a contract call into a proposal: it reaches the chain only after the second
 * member approves it, so an answer without a broadcast id is a pending proposal, not a failure.
 * A multisig answer that carries an id is followed on chain, still as a proposal until it lands.
 */
export function walletOutcome(signer: string, response: unknown): WalletOutcome {
  const txid = txIdOf(response);
  if (isMultisigAddress(signer)) return txid ? { kind: "proposal", txid } : { kind: "proposal" };
  return txid ? { kind: "broadcast", txid } : { kind: "missing" };
}

/**
 * The steps a Leather multisig account follows after it creates a proposal, as observed on mainnet:
 * every member approves it in Leather multisig, then one member broadcasts it. Nothing reaches the
 * chain before the broadcast.
 */
export const MULTISIG_STEPS = [
  "Each member opens Leather multisig, goes to Activity, opens the proposal and approves it.",
  "When every member has approved, one member presses Broadcast. The transaction reaches the chain only then.",
] as const;

/** Plain text for a proposal that still needs the members' approvals and the broadcast. */
export function proposalNotice(label: string, deadline?: { block: number; height: number }): string {
  const base = `${label} is now a proposal in Leather multisig. ${MULTISIG_STEPS.join(" ")}`;
  if (!deadline || !deadline.block) return base;
  return `${base} Broadcast it before Bitcoin block ${deadline.block.toLocaleString("en-US")}.`;
}
