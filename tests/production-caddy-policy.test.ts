import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const policy = readFileSync(
  resolve(process.cwd(), "ops/vps/caddy/nayori-api-private-evidence.caddy"),
  "utf8",
);

describe("production API Caddy POST policy", () => {
  it("allowlists only the implemented public POST routes", () => {
    const line = policy
      .split("\n")
      .find((candidate) => candidate.trim().startsWith("not path "));

    expect(line).toBeDefined();
    expect(new Set(line!.trim().split(/\s+/).slice(2))).toEqual(
      new Set([
        "/v1/quotes",
        "/mcp",
        "/v1/private-evidence/prepare",
        "/v1/private-evidence/complete",
        "/v1/private-evidence/download",
      ]),
    );
  });

  it("keeps unsupported POST requests fail-closed without a wildcard", () => {
    expect(policy).toContain("method POST");
    expect(policy).toContain("respond @unsupported_post 404");
    expect(policy).not.toContain("/v1/private-evidence/*");
    expect(policy).not.toMatch(/reverse_proxy|authorization|credential|\.env|token/i);
  });
});
