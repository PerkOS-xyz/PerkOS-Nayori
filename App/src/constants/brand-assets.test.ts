import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function expectPng(path: string) {
  const file = readFileSync(resolve(process.cwd(), path));
  expect(file.subarray(1, 4).toString()).toBe("PNG");
  expect(file.byteLength).toBeGreaterThan(100_000);
}

describe("Nayori Web brand assets", () => {
  it("publishes the approved product identity assets", () => {
    expectPng("public/brand/Logo.png");
    expectPng("public/brand/Banner-Web.png");
    expectPng("public/brand/PerkOS.png");
  });

  it("uses the approved logo in the header and Web-specific hero background", () => {
    const logo = readFileSync(resolve(process.cwd(), "src/components/Logo.tsx"), "utf8");
    const hero = readFileSync(
      resolve(process.cwd(), "src/components/landing/Hero.tsx"),
      "utf8",
    );

    expect(logo).toContain('/brand/Logo.png');
    expect(logo).toContain('/brand/PerkOS.png');
    expect(hero).toContain('/brand/Banner-Web.webp');
    expect(hero).not.toContain('/brand/Banner.png');
    expect(hero).toContain('alt=""');
  });

  it("copies public assets into the standalone VPS image", () => {
    const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");

    expect(dockerfile).toContain(
      "COPY --from=builder --chown=nextjs:nodejs /app/public ./public",
    );
  });
});
