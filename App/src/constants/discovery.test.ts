import { describe, expect, it } from "vitest";
import {
  buildDiscoveryManifest,
  buildLlmsText,
  NAYORI_API_ORIGIN,
  NAYORI_FACILITATOR_ORIGIN,
  NAYORI_OAUTH_ORIGIN,
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
    expect(manifest.discovery.evidenceJson).toBe(`${origin}/api/evidence.json`);
    expect(manifest.discovery.paidResource).toBe(`${origin}/api/v1`);
    expect(manifest.discovery.mppPaidResource).toBe(`${origin}/api/mpp/v1`);
    expect(manifest.discovery.facilitator.origin).toBe(NAYORI_FACILITATOR_ORIGIN);
    expect(manifest.discovery.quoteApi.oauthAuthorizationServer).toBe(
      `${NAYORI_OAUTH_ORIGIN}/.well-known/oauth-authorization-server`
    );
    expect(manifest.discovery.quoteApi.oauthProtectedResource).toBe(
      `${origin}/.well-known/oauth-protected-resource`
    );
    expect(manifest.discovery.quoteApi.authGuide).toBe(`${origin}/auth.md`);
    expect(manifest.discovery.quoteApi.mcp).toBe(`${NAYORI_API_ORIGIN}/mcp`);
    expect(manifest.availability.publicFacilitatorApi).toBe(true);
    expect(manifest.availability.publicPaidResource).toBe(true);
    expect(manifest.availability.mppPaymentAuth).toBe(true);
    expect(manifest.availability.quoteIssuance).toBe(true);
    expect(manifest.availability.paymentVerification).toBe(true);
    expect(manifest.availability.settlement).toBe(true);
    expect(manifest.availability.oauth).toBe(true);
    expect(manifest.availability.mcp).toBe(true);
    expect(manifest.availability.sponsorship).toBe(false);
    expect(manifest.availability.a2aProtocolEndpoint).toBe(false);
    expect(manifest.capabilities[3].quoteService).toMatchObject({
      status: "public-resource-and-invite-only-api-testnet-settlement",
      network: "stacks:2147483648",
      quoteIssuance: true,
      paymentVerification: true,
      settlement: true,
      confirmation: true,
      deliveryLedger: true,
      mcp: true,
      sponsorship: false,
    });
    expect(manifest.capabilities.find((item) => item.id === "mpp-usdcx-stacks")).toMatchObject({
      assets: ["USDCx"],
      publicResource: {
        method: "usdc",
        intent: "charge",
        type: "stacks",
        credentialHeader: "Payment-Authorization",
        sponsorship: false,
      },
    });
  });

  it("publishes the quote API without implying payment settlement", () => {
    const text = buildLlmsText(origin);

    expect(text).toContain(`${origin}/.well-known/agent.json`);
    expect(text).toContain(`${origin}/api/v1`);
    expect(text).toContain(`${origin}/api/mpp/v1`);
    expect(text).toContain(`${NAYORI_API_ORIGIN}/supported`);
    expect(text).toContain(`${origin}/.well-known/api-catalog`);
    expect(text).toContain(`${origin}/.well-known/ard.json`);
    expect(text).toContain(`${origin}/.well-known/agent-skills/index.json`);
    expect(text).toContain("three read-only WebMCP tools");
    expect(text).toContain("invite-only partner pilot");
    expect(text).toContain("PAYMENT-REQUIRED");
    expect(text).toContain("Payment-Authorization");
    expect(text).toContain("Payment-Receipt");
    expect(text).toContain("Only the confirmed settlement state and signed receipt");
    expect(text).toContain(`${origin}/api/evidence.json`);
    expect(text).toContain(`${origin}/auth.md`);
    expect(text).toContain(`${NAYORI_OAUTH_ORIGIN}/.well-known/oauth-authorization-server`);
    expect(text).toContain("requires authorization from a Stacks wallet");
  });
});
