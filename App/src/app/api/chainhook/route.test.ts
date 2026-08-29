import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://nayori.ai/api/chainhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("chainhook receiver", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed when no receiver secret is configured", async () => {
    vi.stubEnv("CHAINHOOK_SECRET", "");
    const response = await POST(request('{"apply":[]}'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "receiver_not_configured" });
  });

  it("rejects an invalid bearer credential", async () => {
    vi.stubEnv("CHAINHOOK_SECRET", "expected");
    const response = await POST(request('{"apply":[]}', { authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
  });

  it("accepts a bounded authenticated payload", async () => {
    vi.stubEnv("CHAINHOOK_SECRET", "expected");
    const response = await POST(request('{"apply":[{},{}]}', { authorization: "Bearer expected" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, received: 2 });
  });

  it("rejects an oversized payload before parsing it", async () => {
    vi.stubEnv("CHAINHOOK_SECRET", "expected");
    const response = await POST(request("{}", {
      authorization: "Bearer expected",
      "content-length": "65537",
    }));
    expect(response.status).toBe(413);
  });
});
