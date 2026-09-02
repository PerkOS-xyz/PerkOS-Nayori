import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const institutionalName = "Nayori — PerkOS Stacks Agentic Commerce";

describe("Nayori brand continuity", () => {
  it("keeps the institutional name in repository entry points", () => {
    ["README.md", "STATUS.md", "App/README.md", "contracts/README.md"].forEach((path) => {
      expect(read(path)).toContain(institutionalName);
    });
  });

  it("uses branded private workspace package identifiers", () => {
    expect(JSON.parse(read("package.json")).name).toBe("perkos-nayori-contracts");
    expect(JSON.parse(read("App/package.json")).name).toBe("perkos-nayori-app");
    expect(JSON.parse(read("developer-portal/package.json")).name).toBe("@perkos/nayori-docs");
  });
});
