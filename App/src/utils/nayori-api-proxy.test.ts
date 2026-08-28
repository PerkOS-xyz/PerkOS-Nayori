import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyNayoriApiDiscovery } from "./nayori-api-proxy";

afterEach(() => vi.restoreAllMocks());

describe("Nayori API discovery proxy", () => {
  it("publishes canonical upstream metadata without forwarding credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ issuer: "https://api.nayori.ai" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const response = await proxyNayoriApiDiscovery("/x402.json");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-location")).toBe(
      "https://api.nayori.ai/x402.json",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.nayori.ai/x402.json",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(await response.json()).toEqual({ issuer: "https://api.nayori.ai" });
  });

  it("fails closed for unavailable and unapproved resources", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect((await proxyNayoriApiDiscovery("/x402.json")).status).toBe(503);
    expect((await proxyNayoriApiDiscovery("/oauth/token")).status).toBe(404);
  });
});
