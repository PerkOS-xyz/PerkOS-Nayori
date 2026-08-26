import { describe, expect, it } from "vitest";
import { buildDiscoveryManifest, buildLlmsText } from "./discovery";
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
    expect(manifest.availability.publicFacilitatorApi).toBe(false);
    expect(manifest.availability.a2aProtocolEndpoint).toBe(false);
  });

  it("does not imply that the facilitator is already live", () => {
    const text = buildLlmsText(origin);

    expect(text).toContain(`${origin}/.well-known/agent.json`);
    expect(text).toContain("public Nayori facilitator API is not live yet");
    expect(text).toContain("requires authorization from a Stacks wallet");
  });
});
