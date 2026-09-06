import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { docsOriginForRelease } from "./docs";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

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
    vi.stubEnv("NEXT_PUBLIC_RELEASE_CHANNEL", channel);
    vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", channel === "qa" ? "testnet" : "mainnet");
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
});
