import { NETWORK_NAME } from "./network";

const MAINNET_DEPLOYER = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const TESTNET_DEPLOYER = "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5";

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  (NETWORK_NAME === "mainnet" ? MAINNET_DEPLOYER : TESTNET_DEPLOYER);
export const STX_COMMERCE_CONTRACT_NAME =
  process.env.NEXT_PUBLIC_STX_COMMERCE_CONTRACT || "agentic-commerce-v2";

const prefixMatches =
  (NETWORK_NAME === "mainnet" && CONTRACT_ADDRESS.startsWith("SP")) ||
  (NETWORK_NAME === "testnet" && CONTRACT_ADDRESS.startsWith("ST"));

if (!prefixMatches) {
  throw new Error(
    `NEXT_PUBLIC_CONTRACT_ADDRESS (${CONTRACT_ADDRESS}) does not match ${NETWORK_NAME}`
  );
}

if (!/^[a-z][a-z0-9-]{0,39}$/.test(STX_COMMERCE_CONTRACT_NAME)) {
  throw new Error(
    `NEXT_PUBLIC_STX_COMMERCE_CONTRACT (${STX_COMMERCE_CONTRACT_NAME}) is not a valid Clarity contract name`
  );
}

export const AGENT_REGISTRY_CONTRACT = `${CONTRACT_ADDRESS}.agent-registry`;
export const AGENTIC_COMMERCE_CONTRACT =
  `${CONTRACT_ADDRESS}.${STX_COMMERCE_CONTRACT_NAME}`;
export const STX_COMMERCE_IS_HARDENED =
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v2";
