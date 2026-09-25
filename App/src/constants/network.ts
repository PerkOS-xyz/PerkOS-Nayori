import { STACKS_MAINNET, STACKS_TESTNET, StacksNetwork } from "@stacks/network";
import { hiroFetch } from "../services/hiro-fetch";

export type NetworkName = "mainnet" | "testnet";

export function resolveNetworkName(value?: string): NetworkName {
  if (!value) return "mainnet";
  if (value === "mainnet" || value === "testnet") return value;
  throw new Error(
    `NEXT_PUBLIC_STACKS_NETWORK (${value}) must be "mainnet" or "testnet"`
  );
}

// The public product is a mainnet application. Testnet must be selected explicitly.
export const NETWORK_NAME = resolveNetworkName(
  process.env.NEXT_PUBLIC_STACKS_NETWORK
);

// Network object for read-only calls (fetchCallReadOnlyFunction). Server-side reads carry the
// deployment's Hiro API key when `HIRO_API_KEY` is set; in the browser this is plain fetch.
const baseNetwork: StacksNetwork = NETWORK_NAME === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
export const NETWORK: StacksNetwork = { ...baseNetwork, client: { ...baseNetwork.client, fetch: hiroFetch } };
