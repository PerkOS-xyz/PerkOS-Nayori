import { NETWORK_NAME } from "./network";

// Canonical sBTC token (SIP-010). The escrow validates every call against the principal
// stored on-chain via set-payment-token, so these must match that configuration.
export const SBTC_TOKEN =
  NETWORK_NAME === "mainnet"
    ? "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token"
    : "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token";

export const [SBTC_ADDRESS, SBTC_NAME] = SBTC_TOKEN.split(".") as [string, string];

// sBTC is denominated in sats: 1 sBTC = 100_000_000 sats, mirroring Bitcoin.
export const SBTC_DECIMALS = 8;
export const SATS_PER_SBTC = 100_000_000;
