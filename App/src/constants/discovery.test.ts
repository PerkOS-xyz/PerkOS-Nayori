import { describe, expect, it } from "vitest";
import {
  buildDiscoveryManifest,
  buildLlmsText,
  NAYORI_API_ORIGIN,
} from "./discovery";
import { resolveSiteOrigin } from "./site";

describe("public site origin", () => {
  it("normalizes configured origins", () => {
    expect(resolveSiteOrigin("https://preview.nayori.ai/path")).toBe(
      "https://preview.nayori.ai"
    );
    expect(resolveSiteOrigin("http://localhost:3000/docs")).toBe(
      "http://localhost:3000"
    );
  });

  it("requires HTTPS for public deployments", () => {
    expect(() => resolveSiteOrigin("http://nayori.ai")).toThrow(
      "must use HTTPS"
    );
  });
});

describe("agent discovery", () => {
  const origin = "https://preview.nayori.ai";

  it("publishes canonical, wallet-safe mainnet capabilities", () => {
    const manifest = buildDiscoveryManifest(origin);

    expect(manifest.homepage).toBe(origin);
    expect(manifest.network).toBe("stacks:1");
    expect(manifest.authorization.custody).toContain("does not request");
    expect(manifest.contracts.stxEscrow).toContain("agentic-commerce-v2");
    expect(manifest.discovery.quoteApi.origin).toBe(NAYORI_API_ORIGIN);
    expect(manifest.discovery.quoteApi.openapi).toBe(
      `${NAYORI_API_ORIGIN}/openapi.json`
    );
    expect(manifest.discovery.apiCatalog).toBe(
      `${origin}/.well-known/api-catalog`
    );
    expect(manifest.discovery.ard).toBe(`${origin}/.well-known/ard.json`);
    expect(manifest.discovery.agentSkills).toBe(
      `${origin}/.well-known/agent-skills/index.json`
    );
    expect(manifest.availability.publicFacilitatorApi).toBe(true);
    expect(manifest.availability.quoteIssuance).toBe(true);
    expect(manifest.availability.paymentVerification).toBe(false);
    expect(manifest.availability.settlement).toBe(false);
    expect(manifest.availability.sponsorship).toBe(false);
    expect(manifest.availability.a2aProtocolEndpoint).toBe(false);
    expect(manifest.capabilities[3].quoteService).toMatchObject({
      status: "quote-only",
      network: "stacks:2147483648",
      quoteIssuance: true,
      paymentVerification: false,
      settlement: false,
      sponsorship: false,
    });
  });

  it("publishes the quote API without implying payment settlement", () => {
    const text = buildLlmsText(origin);

    expect(text).toContain(`${origin}/.well-known/agent.json`);
    expect(text).toContain(`${NAYORI_API_ORIGIN}/supported`);
    expect(text).toContain(`${origin}/.well-known/api-catalog`);
    expect(text).toContain(`${origin}/.well-known/ard.json`);
    expect(text).toContain(`${origin}/.well-known/agent-skills/index.json`);
    expect(text).toContain("two read-only WebMCP tools");
    expect(text).toContain("issues short-lived, request-bound quotes");
    expect(text).toContain("A signed quote is not proof of payment or settlement");
    expect(text).toContain("requires authorization from a Stacks wallet");
  });
});
