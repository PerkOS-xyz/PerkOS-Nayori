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

export function buildProtectedResourceMetadata(resource = SITE_ORIGIN) {
  return {
    resource,
    authorization_servers: [NAYORI_OAUTH_ORIGIN],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${resource}/auth.md`,
  } as const;
}

export function buildAuthMarkdown(resource = SITE_ORIGIN): string {
  return `# Auth.md — Nayori agent authentication

Nayori uses OAuth 2.0 client credentials for invited partners. Enrollment is bound to a Stacks
wallet by an exact plaintext message signed in Leather. Nayori never requests or stores a wallet
private key.

## Discovery

- Protected resource: ${resource}/.well-known/oauth-protected-resource
- Authorization server: ${NAYORI_OAUTH_ORIGIN}/.well-known/oauth-authorization-server
- Token endpoint: ${NAYORI_OAUTH_ORIGIN}/oauth/token
- OAuth JWKS: ${NAYORI_OAUTH_ORIGIN}/oauth/jwks.json
- API, MCP and x402 resource server: ${NAYORI_API_ORIGIN}

## Registration

Registration is invite-only. An operator supplies a one-time invitation through a private channel.
The partner requests a wallet challenge, signs the returned message verbatim in Leather and stores
the returned OAuth client secret once. Use client_credentials with client_secret_basic and request
only the minimum required scope.

## Authorization boundary

OAuth authorizes API and MCP calls. It cannot sign, sponsor or approve an STX, sBTC or USDCx
payment. Each payment remains a separate transaction reviewed and signed by the payer's wallet.

Access tokens use EdDSA, have issuer ${NAYORI_OAUTH_ORIGIN}, audience ${resource} and expire in no
more than 15 minutes. Supported scopes: ${OAUTH_SCOPES.join(", ")}.
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
