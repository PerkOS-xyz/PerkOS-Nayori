// Every string here is traceable to README.md — "What Nayori provides",
// "Enterprise capability matrix" and "Current boundary". No invented claims.

import { NETWORK_NAME } from "../../constants/network";

export type Model = {
  id: string;
  name: string;
  when: string;
  steps: { n: string; title: string; desc: string }[];
  footnote: string;
};

export const MODELS: Model[] = [
  {
    id: "escrow",
    name: "Escrowed work",
    when: "When delivery takes time, or needs a neutral decision.",
    steps: [
      { n: "01", title: "Fund", desc: "A client creates and funds a job in STX or sBTC. The contract custodies the budget." },
      { n: "02", title: "Deliver", desc: "The provider commits the work against the on-chain job record." },
      { n: "03", title: "Evaluate", desc: "A neutral evaluator completes or rejects it inside the review window." },
      { n: "04", title: "Settle", desc: "Completion releases escrow to the provider and updates job-linked reputation." },
    ],
    footnote: "Rejection or expiry returns funds according to the contract lifecycle.",
  },
  {
    id: "direct",
    name: "Direct paid resources",
    when: "When an agent needs an immediate API response.",
    steps: [
      { n: "01", title: "Challenge", desc: "The server issues a request-bound payment challenge for the resource." },
      { n: "02", title: "Sign", desc: "The payer signs a canonical Stacks transaction. The wallet stays the signing boundary." },
      { n: "03", title: "Confirm", desc: "The facilitator verifies, broadcasts once and waits for canonical confirmation." },
      { n: "04", title: "Deliver", desc: "An idempotent delivery record releases the resource with a signed receipt." },
    ],
    footnote: "x402 for STX, sBTC and USDCx profiles; MPP PaymentAuth for USDCx.",
  },
];

export const ENFORCEMENT: { capability: string; where: string }[] = [
  { capability: "Agent identity", where: "Stacks agent registry + OAuth agent identity" },
  { capability: "STX and sBTC escrow", where: "Clarity commerce contracts" },
  { capability: "Reputation", where: "Reputation contract with authorized protocol callers" },
  { capability: "Capability validation", where: "validation-registry contract, proof-hash attestations" },
  { capability: "Spending controls", where: "SDK fail-closed spending policy" },
  { capability: "Replay protection", where: "PostgreSQL uniqueness and atomic reservation" },
  { capability: "Confirmation receipts", where: "Reconciliation worker + signed receipt" },
];

export type BoundaryState = "live" | "rollout" | "gated";

export const BOUNDARY: { state: BoundaryState; label: string; what: string; detail: string }[] = [
  {
    state: "live",
    label: "Live on mainnet",
    what: "Identity, validation, STX and sBTC escrow, reputation",
    detail: "Six current contracts, publicly verifiable on the Stacks explorer.",
  },
  {
    state: "rollout",
    label: NETWORK_NAME === "mainnet" ? "Live direct commerce" : "Controlled rollout",
    what: "Public x402 and MPP paid-resource paths",
    detail: `Live on Stacks ${NETWORK_NAME} with confirmation-gated settlement.`,
  },
  {
    state: "gated",
    label: "Deliberately closed",
    what: "Transaction sponsorship",
    detail: "Disabled; every direct payment remains separately approved by the payer.",
  },
];
