import { describe, expect, it } from "vitest";
import {
  buildAuthMarkdown,
  buildMcpServerCard,
  buildProtectedResourceMetadata,
  NAYORI_OAUTH_ORIGIN,
} from "./oauth-discovery";

const origin = "https://preview.nayori.ai";

describe("canonical OAuth and MCP discovery", () => {
  it("identifies the evaluated site as the protected resource", () => {
    expect(buildProtectedResourceMetadata(origin)).toMatchObject({
      resource: origin,
      authorization_servers: [NAYORI_OAUTH_ORIGIN],
      resource_documentation: `${origin}/auth.md`,
      scopes_supported: expect.arrayContaining(["agent:self"]),
    });
  });

  it("publishes an Auth.md heading and the wallet-signing boundary", () => {
    const markdown = buildAuthMarkdown(origin);
    expect(markdown).toMatch(/^# Auth\.md — Nayori agent authentication/);
    expect(markdown).toContain(`${NAYORI_OAUTH_ORIGIN}/oauth/token`);
    expect(markdown).toContain(`${NAYORI_OAUTH_ORIGIN}/agent/identity`);
    expect(markdown).toContain("SIP-018");
    expect(markdown).toContain("agent:self");
    expect(markdown).toContain("cannot sign, sponsor or approve");
  });

  it("publishes MCP server identity and canonical OAuth metadata", () => {
    expect(buildMcpServerCard(origin)).toMatchObject({
      serverInfo: { name: "nayori-x402", version: "0.5.0" },
      server: { url: "https://api.nayori.ai/mcp" },
      authentication: {
        protectedResourceMetadata: `${origin}/.well-known/oauth-protected-resource`,
      },
    });
  });
});
