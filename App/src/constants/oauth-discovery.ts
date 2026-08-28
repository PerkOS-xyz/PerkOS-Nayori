import { NAYORI_API_ORIGIN, NAYORI_OAUTH_ORIGIN } from "./discovery";
import { SITE_ORIGIN } from "./site";

export { NAYORI_OAUTH_ORIGIN };
export const OAUTH_SCOPES = [
  "catalog:read",
  "quotes:create",
  "payments:verify",
  "payments:settle",
  "payments:read",
  "mcp:invoke",
] as const;
export const AGENT_SCOPES = ["agent:self"] as const;

export function buildProtectedResourceMetadata(resource = SITE_ORIGIN) {
  return {
    resource,
    authorization_servers: [NAYORI_OAUTH_ORIGIN],
    scopes_supported: [...OAUTH_SCOPES, ...AGENT_SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: `${resource}/auth.md`,
  } as const;
}

export function buildAuthMarkdown(resource = SITE_ORIGIN): string {
  return `# Auth.md — Nayori agent authentication

Nayori supports anonymous agent registration with optional wallet ownership claims and invite-only
partner OAuth. An anonymous agent receives only \`agent:self\`; claiming it with Leather never
grants quote, payment, settlement, MCP or merchant access. Nayori never requests or stores a wallet
private key.

## Discovery

- Protected resource: ${resource}/.well-known/oauth-protected-resource
- Authorization server: ${NAYORI_OAUTH_ORIGIN}/.well-known/oauth-authorization-server
- Token endpoint: ${NAYORI_OAUTH_ORIGIN}/oauth/token
- OAuth JWKS: ${NAYORI_OAUTH_ORIGIN}/oauth/jwks.json
- API, MCP and x402 resource server: ${NAYORI_API_ORIGIN}

## Pick a method

- Anonymous agent: POST \`{"type":"anonymous","label":"optional"}\` to
  ${NAYORI_OAUTH_ORIGIN}/agent/identity. No invitation or wallet is required.
- Invited commerce partner: use a separately issued operator invitation and \`client_credentials\`.

## Register an anonymous agent

The response contains \`registration_id\`, a short-lived \`identity_assertion\`, opaque
\`claim_token\`, \`user_code\`, \`claim_url\`, expiry and polling interval. Store the claim token as
a secret. Exchange the assertion at the token endpoint with grant type
\`urn:ietf:params:oauth:grant-type:jwt-bearer\` and form field \`assertion\`.

The access token has exactly \`agent:self\` and can read
${NAYORI_OAUTH_ORIGIN}/v1/agent-registrations/self. It cannot call merchant commerce APIs.

## Claim with Leather

1. Give the human the \`claim_url\` and separately display the \`user_code\`.
2. The claim page sends them to ${NAYORI_OAUTH_ORIGIN}/agent/identity/claim to obtain the exact
   SIP-018 structured payload.
3. Leather signs the \`Nayori Agent Claim\` domain for the advertised Stacks network.
4. The page submits it to ${NAYORI_OAUTH_ORIGIN}/agent/identity/claim/complete.
5. Poll the token endpoint no faster than the returned interval with grant type
   \`urn:workos:agent-auth:grant-type:claim\` and form field \`claim_token\`.

The token endpoint returns \`authorization_pending\`, \`slow_down\` or \`expired_token\` while a
claim is unavailable. A completed claim still has only \`agent:self\`.

## Invited partner registration

Registration is invite-only. An operator supplies a one-time invitation through a private channel.
The partner requests a wallet challenge, signs the returned message verbatim in Leather and stores
the returned OAuth client secret once. Use client_credentials with client_secret_basic and request
only the minimum required scope.

Anonymous registrations and their assertions are never accepted as partner invitations or OAuth
client credentials.

## Expiry and revocation

Assertions, access tokens and claim ceremonies expire. There is no refresh token or public
revocation endpoint in this release. Register again after an unclaimed ceremony expires. Nayori can
disable a compromised registration server-side, causing subsequent self lookups to fail.

## Authorization boundary

OAuth authorizes API and MCP calls. It cannot sign, sponsor or approve an STX, sBTC or USDCx
payment. Each payment remains a separate transaction reviewed and signed by the payer's wallet.

Access tokens use EdDSA, have issuer ${NAYORI_OAUTH_ORIGIN}, audience ${resource} and expire in no
more than 15 minutes. Automatic agent scope: ${AGENT_SCOPES.join(", ")}. Invite-only partner scopes:
${OAUTH_SCOPES.join(", ")}.
`;
}

export function buildMcpServerCard(resource = SITE_ORIGIN) {
  return {
    schemaVersion: "1.0",
    name: "Nayori x402 MCP Server",
    serverInfo: { name: "nayori-x402", version: "0.5.0" },
    description:
      "Experimental authenticated MCP access to Nayori x402 discovery, quotes and settlement status.",
    status: "experimental",
    server: {
      url: `${NAYORI_API_ORIGIN}/mcp`,
      transport: "streamable-http",
      protocolVersion: "2025-11-25",
    },
    authentication: {
      type: "oauth2",
      protectedResourceMetadata: `${resource}/.well-known/oauth-protected-resource`,
      requiredScopes: ["mcp:invoke"],
    },
    capabilities: { tools: true, prompts: false, resources: false },
    documentation: `${resource}/auth.md`,
  } as const;
}
