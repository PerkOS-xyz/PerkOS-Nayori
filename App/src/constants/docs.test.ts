import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { docsOriginForRelease } from "./docs";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

const RELEASE_ENV = {
  qa: {
    NEXT_PUBLIC_RELEASE_CHANNEL: "qa",
    NEXT_PUBLIC_SITE_URL: "https://qa.nayori.ai",
    NEXT_PUBLIC_STACKS_NETWORK: "testnet",
    NEXT_PUBLIC_CONTRACT_ADDRESS: "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5",
    NEXT_PUBLIC_CONTRACT_PROFILE: "current-v6-v5",
    NEXT_PUBLIC_STX_COMMERCE_CONTRACT: "agentic-commerce-v6",
    NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT: "sbtc-commerce-v5",
    NEXT_PUBLIC_REPUTATION_CONTRACT: "reputation-registry-v3",
    NEXT_PUBLIC_NAYORI_EVALUATOR_ADDRESS: "STBTXHXFXFGMNPXST7A6XQ1WNGC0V6TB6CDDQZB4",
    NEXT_PUBLIC_NAYORI_MANAGED_EVALUATOR_ENABLED: "true",
    NEXT_PUBLIC_NAYORI_APPEAL_AUTHORITY_ADDRESS: "ST256E5DAXM7RDFZ76ECCTPTBYHRXXJQ29H16DN69",
    NEXT_PUBLIC_NAYORI_API_ORIGIN: "https://api.qa.nayori.ai",
    NEXT_PUBLIC_NAYORI_FACILITATOR_ORIGIN: "https://facilitator.qa.nayori.ai",
    NEXT_PUBLIC_NAYORI_OAUTH_ORIGIN: "https://oauth.qa.nayori.ai",
  },
  production: {
    NEXT_PUBLIC_RELEASE_CHANNEL: "production",
    NEXT_PUBLIC_SITE_URL: "https://nayori.ai",
    NEXT_PUBLIC_STACKS_NETWORK: "mainnet",
    NEXT_PUBLIC_CONTRACT_ADDRESS: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH",
    NEXT_PUBLIC_CONTRACT_PROFILE: "current-v6-v5",
    NEXT_PUBLIC_STX_COMMERCE_CONTRACT: "agentic-commerce-v6",
    NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT: "sbtc-commerce-v5",
    NEXT_PUBLIC_REPUTATION_CONTRACT: "reputation-registry-v3",
    NEXT_PUBLIC_NAYORI_EVALUATOR_ADDRESS: "SP2ENKFX2BGX94HC4KYZCCV7KEN7JXJXZDKC3GPGC",
    NEXT_PUBLIC_NAYORI_MANAGED_EVALUATOR_ENABLED: "false",
    NEXT_PUBLIC_NAYORI_APPEAL_AUTHORITY_ADDRESS: "SP28DBK3Q89F4KRYGPF51QT0RYEZBPXS4BAQ0ETBH",
    NEXT_PUBLIC_NAYORI_API_ORIGIN: "https://api.nayori.ai",
    NEXT_PUBLIC_NAYORI_FACILITATOR_ORIGIN: "https://facilitator.nayori.ai",
    NEXT_PUBLIC_NAYORI_OAUTH_ORIGIN: "https://oauth.nayori.ai",
  },
} as const;

function stubReleaseEnv(channel: keyof typeof RELEASE_ENV) {
  for (const [name, value] of Object.entries(RELEASE_ENV[channel])) {
    vi.stubEnv(name, value);
  }
}

describe("documentation release routing", () => {
  it.each([
    ["qa", "testnet", "https://docs.qa.nayori.ai"],
    ["production", "mainnet", "https://docs.nayori.ai"],
    ["preview", "mainnet", "https://docs.nayori.ai"],
    ["qa", "mainnet", "https://docs.nayori.ai"],
    [undefined, "testnet", "https://docs.nayori.ai"],
    [undefined, undefined, "https://docs.nayori.ai"],
  ])("routes %s/%s without wallet or URL input", (channel, network, expected) => {
    expect(docsOriginForRelease(channel, network)).toBe(expected);
  });

  it.each(["qa", "production"])("renders both documentation links for %s", async channel => {
    stubReleaseEnv(channel as keyof typeof RELEASE_ENV);
    vi.resetModules();
    const [{ default: Footer }, { default: Quickstart }] = await Promise.all([
      import("../components/SiteFooter"), import("../components/landing/Quickstart"),
    ]);
    const expected = channel === "qa" ? "https://docs.qa.nayori.ai" : "https://docs.nayori.ai";
    for (const component of [Footer, Quickstart]) {
      const html = renderToStaticMarkup(createElement(component));
      expect(html).toContain(`href="${expected}"`);
      if (channel === "qa") expect(html).not.toContain('href="https://docs.nayori.ai"');
    }
  });

  it("fails closed when only the network/deployer are crossed", async () => {
    stubReleaseEnv("production");
    vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ADDRESS", "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5");
    vi.resetModules();

    await expect(import("./contract")).rejects.toThrow(
      "not the reviewed testnet evaluator"
    );
  });
});
