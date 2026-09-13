import {
  COMPANY_NAME,
  PRODUCT_DESCRIPTION,
  PRODUCT_FULL_NAME,
  PRODUCT_NAME,
} from "./brand";
import { SITE_ORIGIN } from "./site";
import { NETWORK_NAME } from "./network";
import {
  CONTRACT_ADDRESS,
  COMMERCE_CONTRACTS_READ_ONLY,
  CONTRACT_PROFILE,
  NAYORI_MANAGED_EVALUATOR_ENABLED,
  REPUTATION_CONTRACT_NAME,
  SBTC_COMMERCE_CONTRACT_NAME,
  STX_COMMERCE_CONTRACT_NAME,
} from "./contract";

export const STACKS_MAINNET_ID = "stacks:1";
export const STACKS_TESTNET_ID = "stacks:2147483648";
export const COMMERCE_NETWORK_ID =
  NETWORK_NAME === "testnet" ? STACKS_TESTNET_ID : STACKS_MAINNET_ID;
export const COMMERCE_NETWORK_LABEL = `Stacks ${NETWORK_NAME}`;
// Both quote API edges issue challenges and expose OAuth/MCP, while their own /supported
// responses keep verification, settlement, confirmation, delivery and partner registration
// disabled. Those economic duties belong to each network's isolated facilitator runtime.
export const NAYORI_QUOTE_API_SETTLEMENT_ACTIVE = false;
export function resolveServiceOrigin(variable: string, value: string): string {
  const url = new URL(value);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocal) {
    throw new Error(`${variable} must use HTTPS outside local development`);
  }
  return url.origin;
}

export const NAYORI_API_ORIGIN = resolveServiceOrigin(
  "NEXT_PUBLIC_NAYORI_API_ORIGIN",
  process.env.NEXT_PUBLIC_NAYORI_API_ORIGIN || "https://api.nayori.ai"
);
export const NAYORI_FACILITATOR_ORIGIN = resolveServiceOrigin(
  "NEXT_PUBLIC_NAYORI_FACILITATOR_ORIGIN",
  process.env.NEXT_PUBLIC_NAYORI_FACILITATOR_ORIGIN || "https://facilitator.nayori.ai"
);
export const NAYORI_OAUTH_ORIGIN = resolveServiceOrigin(
  "NEXT_PUBLIC_NAYORI_OAUTH_ORIGIN",
  process.env.NEXT_PUBLIC_NAYORI_OAUTH_ORIGIN || "https://oauth.nayori.ai"
);
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
    status: NETWORK_NAME === "testnet" ? "qa-testnet-web" : "public-mainnet-web",
    homepage: origin,
    network: COMMERCE_NETWORK_ID,
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
        description: COMMERCE_CONTRACTS_READ_ONLY
          ? "Inspect historical STX and sBTC agent jobs; writes are disabled for this profile."
          : "Create, fund and settle agent jobs in STX or sBTC.",
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
          network: COMMERCE_NETWORK_ID,
          x402Version: 2,
          scheme: "exact",
          assetTransferMethod: "stacks-signed-tx-v1",
          settlement: "asynchronous-confirmation",
          walletApproval: "required",
        },
        quoteService: {
          status: `${NETWORK_NAME}-challenge-issuance-only`,
          network: COMMERCE_NETWORK_ID,
          authorization: "wallet-linked-oauth-or-merchant-key",
          quoteIssuance: true,
          paymentVerification: NAYORI_QUOTE_API_SETTLEMENT_ACTIVE,
          settlement: NAYORI_QUOTE_API_SETTLEMENT_ACTIVE,
          confirmation: NAYORI_QUOTE_API_SETTLEMENT_ACTIVE,
          deliveryLedger: NAYORI_QUOTE_API_SETTLEMENT_ACTIVE,
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
          network: COMMERCE_NETWORK_ID,
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
      writes: COMMERCE_CONTRACTS_READ_ONLY
        ? `commerce writes disabled for historical profile ${CONTRACT_PROFILE}; identity and other writes still require a Stacks wallet signature`
        : "A Stacks wallet must authorize and sign every state-changing transaction.",
      custody: "Nayori does not request or store buyer private keys.",
    },
    contracts: {
      deployer: CONTRACT_ADDRESS,
      agentRegistry: `${CONTRACT_ADDRESS}.agent-registry`,
      reputation: `${CONTRACT_ADDRESS}.${REPUTATION_CONTRACT_NAME}`,
      stxEscrow: `${CONTRACT_ADDRESS}.${STX_COMMERCE_CONTRACT_NAME}`,
      sbtcEscrow: `${CONTRACT_ADDRESS}.${SBTC_COMMERCE_CONTRACT_NAME}`,
    },
    availability: {
      webApplication: true,
      jobEscrowWrites: !COMMERCE_CONTRACTS_READ_ONLY,
      managedEvaluator: NAYORI_MANAGED_EVALUATOR_ENABLED,
      managedEvaluatorStatus:
        NAYORI_MANAGED_EVALUATOR_ENABLED ? "active" : "mainnet-activation-pending",
      publicFacilitatorApi: true,
      publicPaidResource: true,
      mppPaymentAuth: true,
      quoteIssuance: true,
      paymentVerification: true,
      settlement: true,
      confirmation: true,
      deliveryLedger: true,
      settlementProvider: NAYORI_FACILITATOR_ORIGIN,
      quoteApi: {
        quoteIssuance: true,
        paymentVerification: NAYORI_QUOTE_API_SETTLEMENT_ACTIVE,
        settlement: NAYORI_QUOTE_API_SETTLEMENT_ACTIVE,
        confirmation: NAYORI_QUOTE_API_SETTLEMENT_ACTIVE,
        deliveryLedger: NAYORI_QUOTE_API_SETTLEMENT_ACTIVE,
        partnerRegistration: false,
        oauth: true,
        mcp: true,
      },
      facilitator: {
        paymentVerification: true,
        settlement: true,
        confirmation: true,
        deliveryLedger: true,
        publicResource: false,
        partnerRegistration: false,
        oauth: false,
        mcp: false,
      },
      partnerRegistration: false,
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
  const environment = NETWORK_NAME === "testnet" ? "QA/testnet" : "mainnet";
  const networkId = NETWORK_NAME === "testnet" ? STACKS_TESTNET_ID : STACKS_MAINNET_ID;
  const commerceMode = COMMERCE_CONTRACTS_READ_ONLY
    ? `The selected historical contract profile \`${CONTRACT_PROFILE}\` is read-only. Its jobs remain inspectable, but the Web manifest and UI disable commerce writes.`
    : "Every state-changing action requires authorization from a Stacks wallet; Nayori does not request or store buyer private keys.";
  const platformMode = `The ${NETWORK_NAME} quote API enables challenge issuance, OAuth, MCP and public resources. Its own payment verification, settlement, confirmation, delivery-ledger and partner-registration flags are disabled; those economic capabilities are served separately by ${NAYORI_FACILITATOR_ORIGIN}, whose live /supported response must be verified before use.`;
  return `# ${PRODUCT_FULL_NAME}

> ${PRODUCT_DESCRIPTION}

Nayori is a ${environment} web application and TypeScript SDK for autonomous commerce on Stacks. Public reads do not require authentication. ${commerceMode}

## Product

- [Application](${origin}/): ${environment} application and product overview.
- [Agents](${origin}/agents): On-chain agent directory and registration.
- [Jobs](${origin}/jobs): ${COMMERCE_CONTRACTS_READ_ONLY ? "Read-only historical STX and sBTC job escrow records." : "STX and sBTC job escrow lifecycle."}
- [Analytics](${origin}/analytics): Currency-separated protocol activity.
- [Transparency dashboard](${origin}/evidence): Live ${COMMERCE_NETWORK_LABEL} contract totals, explorer-verifiable M1 evidence and explicitly attested M2 adoption.
- [Evidence JSON](${origin}/api/evidence.json): Versioned machine-readable transparency snapshot.
- [Public x402 resource](${origin}/api/v1): A real x402 v2 payment challenge for a settlement-backed Nayori capability report on ${COMMERCE_NETWORK_LABEL}.
- [Public MPP resource](${origin}/api/mpp/v1): MPP PaymentAuth usdc/charge/stacks challenge for the same report, paid in USDCx on ${COMMERCE_NETWORK_LABEL}.
- [Machine manifest](${origin}/.well-known/agent.json): Structured capabilities and canonical contracts.
- [API Catalog](${origin}/.well-known/api-catalog): RFC 9727 links to the public quote API description, documentation and status.
- [ARD catalog](${origin}/.well-known/ard.json): Search-oriented descriptions of Nayori's agentic resources.
- [Agent Skills](${origin}/.well-known/agent-skills/index.json): Integrity-addressed instructions for agents.
- [Sitemap](${origin}/sitemap.xml): Public routes.

## Developer resources

- [Application and contracts](https://github.com/PerkOS-xyz/PerkOS-Nayori): Public source, Clarity contracts and deployment evidence.
- [Nayori Agent SDK](https://github.com/PerkOS-xyz/PerkOS-Nayori-Agent-SDK): TypeScript SDK published as \`@perkos/agent-sdk\`.
- [Nayori commerce API](${NAYORI_API_ORIGIN}): Public-resource and quote edge with OAuth and MCP on ${COMMERCE_NETWORK_LABEL}; inspect its live capability flags separately from the facilitator.
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

## ${NETWORK_NAME === "testnet" ? "QA testnet" : "Mainnet"} contracts

- Agent registry: \`${CONTRACT_ADDRESS}.agent-registry\`
- Reputation: \`${CONTRACT_ADDRESS}.${REPUTATION_CONTRACT_NAME}\`
- STX escrow: \`${CONTRACT_ADDRESS}.${STX_COMMERCE_CONTRACT_NAME}\`
- sBTC escrow: \`${CONTRACT_ADDRESS}.${SBTC_COMMERCE_CONTRACT_NAME}\`
- Network: \`${networkId}\`

## Payment support

- Escrowed jobs: ${COMMERCE_CONTRACTS_READ_ONLY ? "historical STX and sBTC records are read-only in this profile" : "STX and sBTC"}.
- Request-bound direct x402 profile in the SDK: STX, sBTC and USDCx.
- The same-origin x402 resource is ${origin}/api/v1 and the MPP resource is ${origin}/api/mpp/v1. Their challenge responses are public; check both ${NAYORI_API_ORIGIN}/supported for edge issuance and ${NAYORI_FACILITATOR_ORIGIN}/supported for economic execution before attempting a paid settlement. Require matching network/assets and fail closed on disagreement.
- ${platformMode}
- OAuth authorizes API and MCP access. It never signs a payment; each payment transaction remains separately wallet-approved.
- A signed quote, successful verification or broadcast response is not proof of settlement. Only the confirmed settlement state and signed receipt cross that boundary.
- Transaction sponsorship remains disabled; direct payments require a payer-approved transaction.

## Safety

- Verify the Stacks network, contract principal, asset, amount and transaction post-conditions before signing.
- Treat read-only discovery as informational; a wallet signature is required for writes.
- Never send a seed phrase or private key to Nayori, PerkOS, a merchant or an agent.
`;
}
