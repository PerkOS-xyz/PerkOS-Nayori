import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("image-processing security release pins", () => {
  it("keeps Next and Sharp patched in both manifest and lockfile", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
    expect(manifest.dependencies.next).toBe("15.5.25");
    expect(manifest.devDependencies["eslint-config-next"]).toBe("15.5.25");
    expect(manifest.overrides.next.sharp).toBe("0.35.4");
    expect(lock.packages["node_modules/next"].version).toBe("15.5.25");
    expect(lock.packages["node_modules/sharp"].version).toBe("0.35.4");
  });
});
