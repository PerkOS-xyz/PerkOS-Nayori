import { PRODUCT_DESCRIPTION, PRODUCT_FULL_NAME } from "./brand";
import { NAYORI_API_ORIGIN, NAYORI_OAUTH_ORIGIN } from "./discovery";
import { SITE_ORIGIN } from "./site";

export const AGENT_SKILLS_SCHEMA =
  "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
export const AGENT_SKILLS_PATH = "/.well-known/agent-skills/index.json";
export const ARD_PATH = "/.well-known/ard.json";
export const LEGACY_ARD_PATH = "/.well-known/ai-catalog.json";
export const CONTENT_SIGNAL_POLICY =
  "search=yes, ai-input=yes, ai-train=no";

export const PUBLIC_DISCOVERY_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
} as const;

export const agentSkills = [
  {
    name: "nayori-discovery",
    description:
      "Discover Nayori's public application, contracts, API metadata, and machine-readable resources without changing state.",
    content: `---
name: nayori-discovery
description: Discover Nayori's public application, contracts, API metadata, and machine-readable resources without changing state.
---

# Nayori Discovery

Use this skill when an agent needs to understand Nayori's current capabilities before choosing an integration path.

## Procedure

1. Read [the Nayori manifest](${SITE_ORIGIN}/.well-known/agent.json) for the canonical network, contracts, authorization boundaries, and availability flags.
2. Read [llms.txt](${SITE_ORIGIN}/llms.txt) for a concise map of product and developer resources.
3. Read [the API Catalog](${SITE_ORIGIN}/.well-known/api-catalog) before using an HTTP API.
4. Treat public discovery data as informational. Never infer that a listed quote or transaction has been paid or settled.

## Safety boundary

This skill is read-only. Any state-changing Stacks action requires the user's wallet to review and sign the transaction. Nayori does not need a seed phrase or private key.
`,
  },
  {
    name: "nayori-onchain-commerce",
    description:
      "Navigate Nayori's public Stacks agent registry and STX or sBTC escrow jobs while preserving wallet authorization.",
    content: `---
name: nayori-onchain-commerce
description: Navigate Nayori's public Stacks agent registry and STX or sBTC escrow jobs while preserving wallet authorization.
---

# Nayori On-chain Commerce

Use this skill to inspect agents and jobs, or to guide a user to an on-chain commerce action in Nayori.

## Procedure

1. Use [Agents](${SITE_ORIGIN}/agents) to inspect the public on-chain agent registry.
2. Use [Jobs](${SITE_ORIGIN}/jobs) to inspect STX and sBTC escrow jobs.
3. Confirm the Stacks network, asset, amount, contract principal, and post-conditions shown by the wallet before a write.
4. Let the connected Stacks wallet authorize and sign every state-changing transaction.

## Safety boundary

Do not request, collect, transmit, or store a seed phrase or private key. Do not claim that a broadcast transaction is final until its on-chain status confirms completion.
`,
  },
  {
    name: "nayori-x402-quotes",
    description:
      "Purchase Nayori's public x402 resource or use invited API and MCP tools with wallet-approved Stacks testnet payments.",
    content: `---
name: nayori-x402-quotes
description: Purchase Nayori's public x402 resource or use invited API and MCP tools with wallet-approved Stacks testnet payments.
---

# Nayori x402 Payments

Use this skill when an agent needs the public paid report, or an invited partner needs a quote, settlement status, or Nayori MCP tool.

## Procedure

1. Send GET to [the public paid resource](${SITE_ORIGIN}/api/v1) and decode its PAYMENT-REQUIRED x402 v2 header.
2. Read [the supported-capabilities response](${NAYORI_API_ORIGIN}/supported) and [OpenAPI document](${NAYORI_API_ORIGIN}/openapi.json) before constructing the Stacks testnet payment.
3. Use the public SDK and a wallet or approved custody signer to review and create PAYMENT-SIGNATURE. Copy the challenge's signed quote into the advertised X-NAYORI-SIGNED-QUOTE extension header.
4. Resend GET to the same resource with both headers. A 202 response is pending, not paid; follow its Location after Retry-After until a 200 response includes PAYMENT-RESPONSE.
5. For invited API or MCP access, read [OAuth metadata](${NAYORI_OAUTH_ORIGIN}/.well-known/oauth-authorization-server), [protected-resource metadata](${SITE_ORIGIN}/.well-known/oauth-protected-resource), and [Auth.md](${SITE_ORIGIN}/auth.md), then use the minimum documented scope.

## Safety boundary

Public direct payment and the API pilot are limited to Stacks testnet settlement. OAuth cannot sign a payment: the payer separately reviews and signs the exact STX, sBTC, or USDCx transaction. A signed quote, verification, broadcast, or pending state is not confirmed settlement.
`,
  },
  {
    name: "nayori-mpp-usdcx",
    description:
      "Purchase Nayori's public capability report with MPP PaymentAuth and wallet-approved USDCx on Stacks testnet.",
    content: `---
name: nayori-mpp-usdcx
description: Purchase Nayori's public capability report with MPP PaymentAuth and wallet-approved USDCx on Stacks testnet.
---

# Nayori MPP PaymentAuth

Use this skill when a PaymentAuth-compatible agent needs Nayori's paid capability report in USDCx.

## Procedure

1. Send GET to [the MPP resource](${SITE_ORIGIN}/api/mpp/v1) and parse its WWW-Authenticate: Payment challenge plus the body extension containing the signed Nayori quote.
2. Confirm method=usdc, intent=charge, methodDetails.type=stacks, the Stacks testnet network, USDCx asset, amount, recipient and expiry.
3. Use @perkos/agent-sdk 0.6.0 or later to construct the unsigned transaction. Have Leather or the approved custody signer review and sign it without broadcasting from the wallet.
4. Encode the credential and retry GET with Payment-Authorization: Payment ... plus X-NAYORI-SIGNED-QUOTE. Do not replace an unrelated OAuth Authorization: Bearer header.
5. Treat 202 as pending. Follow Location after Retry-After until a 200 response includes Payment-Receipt.

## Safety boundary

The MPP route accepts USDCx only and settlement is testnet-only. Sponsorship is disabled. A challenge, signed transaction, verification, broadcast or pending response is not confirmed payment. Never send a seed phrase or private key.
`,
  },
] as const;

export type AgentSkillName = (typeof agentSkills)[number]["name"];

export function getAgentSkill(name: string) {
  return agentSkills.find((skill) => skill.name === name);
}

export function buildApiCatalog(origin = SITE_ORIGIN) {
  return {
    linkset: [
      {
        anchor: `${origin}/api/v1`,
        "service-desc": [
          {
            href: `${NAYORI_API_ORIGIN}/openapi.json`,
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          {
            href: `${NAYORI_API_ORIGIN}/llms.txt`,
            type: "text/markdown",
          },
          {
            href: `${SITE_ORIGIN}/auth.md`,
            type: "text/markdown",
          },
        ],
        status: [
          {
            href: `${NAYORI_API_ORIGIN}/health`,
            type: "application/json",
          },
        ],
      },
      {
        anchor: `${origin}/api/mpp/v1`,
        "service-desc": [
          {
            href: `${NAYORI_API_ORIGIN}/openapi.json`,
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          {
            href: `${NAYORI_API_ORIGIN}/llms.txt`,
            type: "text/markdown",
          },
        ],
        status: [
          {
            href: `${NAYORI_API_ORIGIN}/health`,
            type: "application/json",
          },
        ],
      },
    ],
  } as const;
}

export function buildArdManifest(origin = SITE_ORIGIN) {
  return {
    specVersion: "0.91",
    host: {
      name: PRODUCT_FULL_NAME,
      description: PRODUCT_DESCRIPTION,
      url: origin,
      displayName: PRODUCT_FULL_NAME,
      identifier: origin,
      documentationUrl: `${origin}/llms.txt`,
    },
    entries: [
      {
        "@context": "https://agenticresourcediscovery.org/context/v1",
        identifier: "urn:air:nayori.ai:application:discovery",
        displayName: `${PRODUCT_FULL_NAME} discovery manifest`,
        type: "application/json",
        url: `${origin}/.well-known/agent.json`,
        description: PRODUCT_DESCRIPTION,
        capabilities: ["agent-identity", "job-escrow", "reputation"],
        representativeQueries: [
          "What can Nayori do on Stacks mainnet?",
          "Which Nayori contracts and assets are available?",
        ],
      },
      {
        "@context": "https://agenticresourcediscovery.org/context/v1",
        identifier: "urn:air:nayori.ai:resource:mpp-usdcx-capability-report",
        displayName: "Nayori MPP USDCx capability report",
        type: "application/json",
        url: `${origin}/api/mpp/v1`,
        description:
          "An MPP PaymentAuth USDCx resource delivered only after canonical Stacks testnet settlement.",
        capabilities: ["mpp-paymentauth", "usdcx", "stacks-testnet", "wallet-approved"],
        representativeQueries: [
          "Purchase Nayori's capability report with MPP PaymentAuth",
          "How do I pay Nayori with USDCx through Payment-Authorization?",
          "When does Nayori return Payment-Receipt?",
        ],
      },
      {
        "@context": "https://agenticresourcediscovery.org/context/v1",
        identifier: "urn:air:nayori.ai:api:x402-quotes",
        displayName: "Nayori x402 quote API",
        type: "application/vnd.oai.openapi+json;version=3.1",
        url: `${NAYORI_API_ORIGIN}/openapi.json`,
        description:
          "Authenticated, request-bound quote issuance for STX, sBTC, and USDCx on Stacks testnet.",
        capabilities: ["x402-quotes", "signed-quotes", "stacks-testnet"],
        representativeQueries: [
          "Create a request-bound STX payment quote on Stacks testnet",
          "Which x402 assets and payment mechanisms does Nayori support?",
          "How can a merchant verify a signed Nayori quote?",
        ],
      },
      {
        "@context": "https://agenticresourcediscovery.org/context/v1",
        identifier: "urn:air:nayori.ai:resource:x402-capability-report",
        displayName: "Nayori paid commerce capability report",
        type: "application/json",
        url: `${origin}/api/v1`,
        description:
          "A real x402 v2 Stacks testnet resource delivered only after canonical settlement confirmation.",
        capabilities: ["x402-payments", "stacks-testnet", "wallet-approved"],
        representativeQueries: [
          "Purchase Nayori's machine-readable commerce capability report",
          "Which x402 headers does Nayori require for a Stacks payment?",
          "How do I poll a Nayori payment until it is confirmed?",
        ],
      },
      {
        "@context": "https://agenticresourcediscovery.org/context/v1",
        identifier: "urn:air:nayori.ai:skills:index",
        displayName: "Nayori Agent Skills index",
        type: "application/json",
        url: `${origin}${AGENT_SKILLS_PATH}`,
        description:
          "Integrity-addressed instructions for discovering and safely using Nayori resources.",
        capabilities: ["agent-skills", "commerce-discovery"],
        representativeQueries: [
          "Find instructions for integrating an agent with Nayori",
          "How should an agent safely use Nayori's commerce resources?",
        ],
      },
      {
        "@context": "https://agenticresourcediscovery.org/context/v1",
        identifier: "urn:air:nayori.ai:evidence:mainnet",
        displayName: "Nayori public grant evidence",
        type: "application/json",
        url: `${origin}/api/evidence.json`,
        description:
          "Live mainnet contract totals, explorer-verifiable M1 evidence and explicitly attested M2 adoption counters.",
        capabilities: ["grant-evidence", "mainnet-transactions", "adoption-metrics"],
        representativeQueries: [
          "Show confirmed Nayori mainnet transaction evidence",
          "Which Milestone 2 adoption requirements are explicitly verified?",
        ],
      },
    ],
  } as const;
}

export function buildDiscoveryLinkHeader(origin = SITE_ORIGIN): string {
  return [
    `<${origin}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
    `<${NAYORI_API_ORIGIN}/openapi.json>; rel="service-desc"; type="application/json"`,
    `<${origin}/api/v1>; rel="payment"; type="application/json"`,
    `<${origin}/api/mpp/v1>; rel="payment"; type="application/json"`,
    `<${origin}/llms.txt>; rel="service-doc"; type="text/markdown"`,
    `<${origin}/llms.txt>; rel="llms-txt"; type="text/markdown"`,
    `<${origin}${ARD_PATH}>; rel="ard"; type="application/json"`,
    `<${origin}${LEGACY_ARD_PATH}>; rel="ai-catalog"; type="application/json"`,
    `<${origin}${AGENT_SKILLS_PATH}>; rel="agent-skills"; type="application/json"`,
    `<${NAYORI_OAUTH_ORIGIN}/.well-known/oauth-authorization-server>; rel="authorization-server"; type="application/json"`,
    `<${origin}/.well-known/oauth-protected-resource>; rel="oauth-protected-resource"; type="application/json"`,
    `<${NAYORI_API_ORIGIN}/.well-known/mcp/server-card.json>; rel="mcp"; type="application/json"`,
    `<${origin}/api/evidence.json>; rel="item"; type="application/json"`,
  ].join(", ");
}

export function buildRobotsText(origin = SITE_ORIGIN): string {
  return `Content-Signal: ${CONTENT_SIGNAL_POLICY}

User-agent: *
Allow: /
Disallow: /api/chainhook

User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: PerplexityBot
Allow: /
Disallow: /api/chainhook

Sitemap: ${origin}/sitemap.xml
Agentmap: ${origin}${LEGACY_ARD_PATH}
`;
}
