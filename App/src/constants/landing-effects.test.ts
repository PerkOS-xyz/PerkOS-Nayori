import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Nayori landing effects", () => {
  it("preserves the semantic hero and enhances it without replacing the banner", () => {
    const home = source("src/app/page.tsx");

    expect(home).toContain("<LandingMotionController />");
    expect(home).toContain('src="/brand/Banner-Web.png"');
    expect(home).toContain("Verifiable commerce for");
    expect(home).toContain('href="/agents"');
    expect(home).toContain("data-nayori-reveal");
    expect(home).toContain('aria-hidden="true"');
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

  it("adds no client animation dependency", () => {
    const packageJson = JSON.parse(source("package.json")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).not.toHaveProperty("motion");
    expect(packageJson.dependencies).not.toHaveProperty("framer-motion");
    expect(packageJson.dependencies).not.toHaveProperty("lenis");
  });
});
