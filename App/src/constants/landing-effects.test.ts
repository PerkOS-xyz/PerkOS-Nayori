import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_DESCRIPTOR,
  PRODUCT_FULL_NAME,
  PRODUCT_TITLE,
} from "./brand";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Nayori landing effects", () => {
  it("preserves the institutional name and commercial tagline", () => {
    expect(PRODUCT_FULL_NAME).toBe("Nayori — PerkOS Stacks Agentic Commerce");
    expect(PRODUCT_TITLE).toBe(
      "Nayori — PerkOS Stacks Agentic Commerce | The Bitcoin Commerce Agent",
    );
    expect(PRODUCT_DESCRIPTOR).toBe("The Bitcoin Commerce Agent");

    const hero = source("src/components/landing/Hero.tsx");
    expect(hero).toContain("{PRODUCT_FULL_NAME}");
  });

  it("preserves the semantic hero and enhances it without replacing the banner", () => {
    const home = source("src/app/page.tsx");
    const hero = source("src/components/landing/Hero.tsx");

    expect(home).toContain("<LandingMotionController />");
    expect(hero).toContain('src="/brand/Banner-Web.webp"');
    expect(hero).toContain("Verifiable commerce for");
    expect(hero).toContain('href="/agents"');
    expect(hero).toContain('alt=""');
    expect(hero).toContain("<HeroVideo />");
  });

  it("uses progressive viewport reveals with a safe reduced-motion fallback", () => {
    const controller = source("src/components/LandingMotionController.tsx");

    expect(controller).toContain("IntersectionObserver");
    expect(controller).toContain("prefers-reduced-motion: reduce");
    expect(controller).toContain('classList.add("nayori-motion-ready")');
    expect(controller).toContain('dataset.nayoriVisible = "true"');
    expect(controller).toContain("observer.unobserve(element)");
  });

  it("keeps the atmosphere decorative, accessible and on-brand", () => {
    const css = source("src/app/globals.css");

    ["#FF8A1E", "#FC6432", "#F7931A", "#FFC38A"].forEach((color) => {
      expect(css.toUpperCase()).toContain(color);
    });
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("html.nayori-motion-ready [data-nayori-reveal]");
  });

  it("allows only the approved client animation dependencies and enforces a bundle budget", () => {
    const packageJson = JSON.parse(source("package.json")) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    const knownAnimationDependencies = [
      "animejs",
      "framer-motion",
      "gsap",
      "lenis",
      "lottie-react",
      "motion",
      "three",
    ];
    const selected = knownAnimationDependencies.filter(
      (dependency) => packageJson.dependencies?.[dependency],
    );

    expect(selected).toEqual(["lenis", "motion"]);
    expect(packageJson.dependencies?.lenis).toBe("^1.3.26");
    expect(packageJson.dependencies?.motion).toBe("^13.1.1");
    expect(packageJson.scripts?.["check:bundle"]).toBe(
      "node scripts/check-bundle-budget.mjs",
    );
  });

  it("keeps network evidence and explorer links bound to the configured environment", () => {
    const ticker = source("src/components/landing/LiveTicker.tsx");
    const footer = source("src/components/SiteFooter.tsx");

    expect(ticker).toContain("NETWORK_NAME");
    expect(ticker).not.toContain("Stacks mainnet");
    expect(footer).toContain("CONTRACT_ADDRESS");
    expect(footer).toContain("NETWORK_NAME");
    expect(footer).not.toContain("SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH");
  });

  it("renders a complete reduced-motion deck and constrains the mobile quickstart", () => {
    const deck = source("src/components/landing/ModelsDeck.tsx");
    const quickstart = source("src/components/landing/Quickstart.tsx");

    expect(deck).toContain("usePrefersReducedMotion");
    expect(deck).toContain("mounted && !reduced");
    expect(deck).toContain("aria-hidden={staged ? index !== active : undefined}");
    expect(quickstart).toContain("grid min-w-0");
    expect(quickstart).toContain('className="min-w-0 lg:col-span-7"');
  });
});
