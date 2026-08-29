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
export const NAYORI_FACILITATOR_ORIGIN = "https://facilitator.nayori.ai";
export const NAYORI_OAUTH_ORIGIN = "https://oauth.nayori.ai";
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
      apiCatalog: `${origin}/.well-known/api-catalog`,
      ard: `${origin}/.well-known/ard.json`,
      agentSkills: `${origin}/.well-known/agent-skills/index.json`,
      source: "https://github.com/PerkOS-xyz/PerkOS-Nayori",
      sdk: "https://github.com/PerkOS-xyz/PerkOS-Nayori-Agent-SDK",
      evidence: `${origin}/evidence`,
      evidenceJson: `${origin}/api/evidence.json`,
      paidResource: `${origin}/api/v1`,
      mppPaidResource: `${origin}/api/mpp/v1`,
      facilitator: {
        origin: NAYORI_FACILITATOR_ORIGIN,
        supported: `${NAYORI_FACILITATOR_ORIGIN}/supported`,
        manifest: `${NAYORI_FACILITATOR_ORIGIN}/.well-known/agent.json`,
      },
      quoteApi: {
        origin: NAYORI_API_ORIGIN,
        manifest: `${NAYORI_API_ORIGIN}/.well-known/agent.json`,
        supported: `${NAYORI_API_ORIGIN}/supported`,
        openapi: `${NAYORI_API_ORIGIN}/openapi.json`,
        jwks: `${NAYORI_API_ORIGIN}/.well-known/jwks.json`,
        oauthAuthorizationServer: `${NAYORI_OAUTH_ORIGIN}/.well-known/oauth-authorization-server`,
        oauthProtectedResource: `${origin}/.well-known/oauth-protected-resource`,
        authGuide: `${origin}/auth.md`,
        mcpServerCard: `${NAYORI_API_ORIGIN}/.well-known/mcp/server-card.json`,
        mcp: `${NAYORI_API_ORIGIN}/mcp`,
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
          "Purchase a public Nayori resource and build request-bound Stacks payments through the public SDK.",
        assets: ["STX", "sBTC", "USDCx"],
        publicResource: {
          url: `${origin}/api/v1`,
          network: STACKS_TESTNET_ID,
          x402Version: 2,
          scheme: "exact",
          assetTransferMethod: "stacks-signed-tx-v1",
          settlement: "asynchronous-confirmation",
          walletApproval: "required",
        },
        quoteService: {
          status: "public-resource-and-invite-only-api-testnet-settlement",
          network: STACKS_TESTNET_ID,
          authorization: "wallet-linked-oauth-or-merchant-key",
          quoteIssuance: true,
          paymentVerification: true,
          settlement: true,
          confirmation: true,
          deliveryLedger: true,
          mcp: true,
          sponsorship: false,
        },
      },
      {
        id: "mpp-usdcx-stacks",
        description:
          "Purchase the public Nayori report through MPP PaymentAuth with wallet-approved USDCx on Stacks.",
        assets: ["USDCx"],
        publicResource: {
          url: `${origin}/api/mpp/v1`,
          network: STACKS_TESTNET_ID,
          protocol: "mpp-paymentauth",
          method: "usdc",
          intent: "charge",
          type: "stacks",
          credentialHeader: "Payment-Authorization",
          receiptHeader: "Payment-Receipt",
          settlement: "asynchronous-confirmation",
          walletApproval: "required",
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
      publicPaidResource: true,
      mppPaymentAuth: true,
      quoteIssuance: true,
      paymentVerification: true,
      settlement: true,
      confirmation: true,
      deliveryLedger: true,
      partnerRegistration: true,
      anonymousAgentRegistration: true,
      walletClaim: true,
      oauth: true,
      mcp: true,
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
- [Transparency dashboard](${origin}/evidence): Live mainnet contract totals, explorer-verifiable M1 evidence and explicitly attested M2 adoption.
- [Evidence JSON](${origin}/api/evidence.json): Versioned machine-readable transparency snapshot.
- [Public x402 resource](${origin}/api/v1): A real x402 v2 payment challenge for a settlement-backed Nayori capability report on Stacks testnet.
- [Public MPP resource](${origin}/api/mpp/v1): MPP PaymentAuth usdc/charge/stacks challenge for the same report, paid in USDCx on Stacks testnet.
- [Machine manifest](${origin}/.well-known/agent.json): Structured capabilities and canonical contracts.
- [API Catalog](${origin}/.well-known/api-catalog): RFC 9727 links to the public quote API description, documentation and status.
- [ARD catalog](${origin}/.well-known/ard.json): Search-oriented descriptions of Nayori's agentic resources.
- [Agent Skills](${origin}/.well-known/agent-skills/index.json): Integrity-addressed instructions for agents.
- [Sitemap](${origin}/sitemap.xml): Public routes.

## Developer resources

- [Application and contracts](https://github.com/PerkOS-xyz/PerkOS-Nayori): Public source, Clarity contracts and deployment evidence.
- [Nayori Agent SDK](https://github.com/PerkOS-xyz/PerkOS-Nayori-Agent-SDK): TypeScript SDK published as \`@perkos/agent-sdk\`.
- [Nayori commerce API](${NAYORI_API_ORIGIN}): Public x402 and MPP paid-resource server plus invite-only merchant and MCP operations on Stacks testnet.
- [Nayori facilitator](${NAYORI_FACILITATOR_ORIGIN}/supported): Isolated quote, verification, settlement-confirmation and delivery-ledger runtime.
- [API capabilities](${NAYORI_API_ORIGIN}/supported): Exact network, mechanism, assets and availability flags.
- [API OpenAPI schema](${NAYORI_API_ORIGIN}/openapi.json): Machine-readable HTTP contract.
- [API JWKS](${NAYORI_API_ORIGIN}/.well-known/jwks.json): Public keys for verifying signed quotes.
- [OAuth discovery](${NAYORI_OAUTH_ORIGIN}/.well-known/oauth-authorization-server): Client-credentials metadata for invited partners.
- [Protected-resource metadata](${origin}/.well-known/oauth-protected-resource): Supported scopes and canonical authorization server.
- [Authentication guide](${origin}/auth.md): Wallet-linked enrollment and payment-signing boundary.
- [MCP server card](${NAYORI_API_ORIGIN}/.well-known/mcp/server-card.json): Experimental authenticated Streamable HTTP tools.

## Browser agent tools

Supporting browsers can discover three read-only WebMCP tools on the application page: capabilities, Agent Skills and the versioned public evidence manifest. These tools never sign a transaction, access wallet credentials or perform a state-changing action.

## Mainnet contracts

- Agent registry: \`${MAINNET_DEPLOYER}.agent-registry\`
- STX escrow: \`${MAINNET_DEPLOYER}.agentic-commerce-v2\`
- sBTC escrow: \`${MAINNET_DEPLOYER}.sbtc-commerce\`
- Network: \`${STACKS_MAINNET_ID}\`

## Payment support

- Escrowed jobs: STX and sBTC.
- Request-bound direct x402 profile in the SDK: STX, sBTC and USDCx.
- The real same-origin paid resource is ${origin}/api/v1. It returns PAYMENT-REQUIRED, accepts a wallet-created PAYMENT-SIGNATURE and the advertised X-NAYORI-SIGNED-QUOTE, then returns 202 until canonical confirmation and PAYMENT-RESPONSE with the delivered report.
- The MPP PaymentAuth resource is ${origin}/api/mpp/v1. It returns WWW-Authenticate: Payment, selects Payment-Authorization so OAuth Bearer remains separate, accepts USDCx only, and emits Payment-Receipt only after canonical confirmation and idempotent delivery.
- The public Nayori API runs an invite-only partner pilot on Stacks testnet (\`${STACKS_TESTNET_ID}\`) for STX, sBTC and USDCx.
- OAuth authorizes API and MCP access. It never signs a payment; each payment transaction remains separately wallet-approved.
- A signed quote, successful verification or broadcast response is not proof of settlement. Only the confirmed settlement state and signed receipt cross that boundary.
- Mainnet facilitator settlement and sponsorship remain disabled while the external security-review gate is open.

## Safety

- Verify the Stacks network, contract principal, asset, amount and transaction post-conditions before signing.
- Treat read-only discovery as informational; a wallet signature is required for writes.
- Never send a seed phrase or private key to Nayori, PerkOS, a merchant or an agent.
`;
}
