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
    const home = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");

    expect(logo).toContain('/brand/Logo.png');
    expect(logo).toContain('/brand/PerkOS.png');
    expect(home).toContain('/brand/Banner-Web.png');
    expect(home).not.toContain('/brand/Banner.png');
    expect(home).toContain('alt=""');
  });
});
