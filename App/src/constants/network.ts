import { STACKS_MAINNET, STACKS_TESTNET, StacksNetwork } from "@stacks/network";

// The public product is a mainnet application. Testnet must be selected explicitly.
const configuredNetwork = process.env.NEXT_PUBLIC_STACKS_NETWORK;
export const NETWORK_NAME: "mainnet" | "testnet" =
  configuredNetwork === "testnet" ? "testnet" : "mainnet";

// Network object for read-only calls (fetchCallReadOnlyFunction)
export const NETWORK: StacksNetwork =
  NETWORK_NAME === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
