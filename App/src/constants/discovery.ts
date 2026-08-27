import {
  COMPANY_NAME,
  PRODUCT_DESCRIPTION,
  PRODUCT_FULL_NAME,
  PRODUCT_NAME,
} from "./brand";
import { SITE_ORIGIN } from "./site";

export const STACKS_MAINNET_ID = "stacks:1";
export const STACKS_TESTNET_ID = "stacks:2147483648";
export const NAYORI_API_ORIGIN = "https://api.nayori.ai";
export const MAINNET_DEPLOYER =
  "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";

export function buildDiscoveryManifest(origin = SITE_ORIGIN) {
  return {
    schemaVersion: "1.0",
    type: "agent-commerce-application",
    name: PRODUCT_NAME,
    displayName: PRODUCT_FULL_NAME,
    description: PRODUCT_DESCRIPTION,
    provider: {
      name: COMPANY_NAME,
      url: "https://perkos.xyz",
    },
    status: "public-mainnet-web",
    homepage: origin,
    network: STACKS_MAINNET_ID,
    discovery: {
      llms: `${origin}/llms.txt`,
      sitemap: `${origin}/sitemap.xml`,
      health: `${origin}/api/health`,
      source: "https://github.com/PerkOS-xyz/Stacks-Agentic-Commerce",
      sdk: "https://github.com/PerkOS-xyz/PerkOS-Nayori-Agent-SDK",
      quoteApi: {
        origin: NAYORI_API_ORIGIN,
        manifest: `${NAYORI_API_ORIGIN}/.well-known/agent.json`,
        supported: `${NAYORI_API_ORIGIN}/supported`,
        openapi: `${NAYORI_API_ORIGIN}/openapi.json`,
        jwks: `${NAYORI_API_ORIGIN}/.well-known/jwks.json`,
      },
    },
    capabilities: [
      {
        id: "agent-identity",
        description: "Register and discover on-chain AI agent identities.",
      },
      {
        id: "job-escrow",
        description: "Create, fund and settle agent jobs in STX or sBTC.",
      },
      {
        id: "reputation",
        description: "Inspect job-linked reputation and validation state.",
      },
      {
        id: "x402-stacks",
        description:
          "Build and verify request-bound Stacks payments through the public SDK.",
        assets: ["STX", "sBTC", "USDCx"],
        quoteService: {
          status: "quote-only",
          network: STACKS_TESTNET_ID,
          authorization: "merchant-bearer",
          quoteIssuance: true,
          paymentVerification: false,
          settlement: false,
          sponsorship: false,
        },
      },
    ],
    authorization: {
      reads: "public",
      writes:
        "A Stacks wallet must authorize and sign every state-changing transaction.",
      custody: "Nayori does not request or store buyer private keys.",
    },
    contracts: {
      deployer: MAINNET_DEPLOYER,
      agentRegistry: `${MAINNET_DEPLOYER}.agent-registry`,
      stxEscrow: `${MAINNET_DEPLOYER}.agentic-commerce-v2`,
      sbtcEscrow: `${MAINNET_DEPLOYER}.sbtc-commerce`,
    },
    availability: {
      webApplication: true,
      publicFacilitatorApi: true,
      quoteIssuance: true,
      paymentVerification: false,
      settlement: false,
      sponsorship: false,
      a2aProtocolEndpoint: false,
    },
  } as const;
}

export function buildLlmsText(origin = SITE_ORIGIN): string {
  return `# ${PRODUCT_FULL_NAME}

> ${PRODUCT_DESCRIPTION}

Nayori is a mainnet web application and TypeScript SDK for autonomous commerce on Stacks. Public reads do not require authentication. Every state-changing action requires authorization from a Stacks wallet; Nayori does not request or store buyer private keys.

## Product

- [Application](${origin}/): Mainnet application and product overview.
- [Agents](${origin}/agents): On-chain agent directory and registration.
- [Jobs](${origin}/jobs): STX and sBTC job escrow lifecycle.
- [Analytics](${origin}/analytics): Currency-separated protocol activity.
- [Machine manifest](${origin}/.well-known/agent.json): Structured capabilities and canonical contracts.
- [Sitemap](${origin}/sitemap.xml): Public routes.

## Developer resources

- [Application and contracts](https://github.com/PerkOS-xyz/Stacks-Agentic-Commerce): Public source, Clarity contracts and deployment evidence.
- [Nayori Agent SDK](https://github.com/PerkOS-xyz/PerkOS-Nayori-Agent-SDK): TypeScript SDK published as \`@perkos/agent-sdk\`.
- [Nayori quote API](${NAYORI_API_ORIGIN}): Authenticated request-bound quote issuance on Stacks testnet.
- [API capabilities](${NAYORI_API_ORIGIN}/supported): Exact network, mechanism, assets and availability flags.
- [API OpenAPI schema](${NAYORI_API_ORIGIN}/openapi.json): Machine-readable HTTP contract.
- [API JWKS](${NAYORI_API_ORIGIN}/.well-known/jwks.json): Public keys for verifying signed quotes.

## Mainnet contracts

- Agent registry: \`${MAINNET_DEPLOYER}.agent-registry\`
- STX escrow: \`${MAINNET_DEPLOYER}.agentic-commerce-v2\`
- sBTC escrow: \`${MAINNET_DEPLOYER}.sbtc-commerce\`
- Network: \`${STACKS_MAINNET_ID}\`

## Payment support

- Escrowed jobs: STX and sBTC.
- Request-bound direct x402 profile in the SDK: STX, sBTC and USDCx.
- The public Nayori API issues short-lived, request-bound quotes on Stacks testnet (\`${STACKS_TESTNET_ID}\`) for authenticated merchants.
- The API does not verify payments, broadcast transactions, settle payments, sponsor fees or deliver paid resources. A signed quote is not proof of payment or settlement.

## Safety

- Verify the Stacks network, contract principal, asset, amount and transaction post-conditions before signing.
- Treat read-only discovery as informational; a wallet signature is required for writes.
- Never send a seed phrase or private key to Nayori, PerkOS, a merchant or an agent.
`;
}
