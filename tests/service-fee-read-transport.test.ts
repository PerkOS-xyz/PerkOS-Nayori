import { afterEach, describe, expect, it, vi } from "vitest";
import { Cl, serializeCV } from "@stacks/transactions";
import {
  API,
  DEPLOYER,
  NETWORK,
  createReadTransport,
  info,
  read,
  ok,
} from "../scripts/service-fee-testnet-core.mjs";

afterEach(() => vi.unstubAllGlobals());

function fixture(responses: Array<Response | Error>) {
  let time = 0;
  const starts: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    time += ms;
  });
  const fetchFn = vi.fn(async () => {
    starts.push(time);
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error("unexpected request");
    return response;
  });
  return {
    fetchFn,
    starts,
    sleep,
    read: createReadTransport({ fetchFn, sleep, now: () => time }),
  };
}
const limited = (retryAfter?: string) =>
  new Response("rate limited", {
    status: 429,
    headers: retryAfter === undefined ? {} : { "retry-after": retryAfter },
  });
const readonlyUrl = `${API}/v2/contracts/call-read/${DEPLOYER}/agentic-commerce-v6/get-job`;

describe("bounded public testnet read transport", () => {
  it("uses the paced transport for both REST and the SDK read-only client", async () => {
    const starts: number[] = [];
    const http = vi.fn(async (url: string) => {
      starts.push(Date.now());
      return new Response(
        JSON.stringify(
          url.endsWith("/v2/info")
            ? { network_id: 2147483648, burn_block_height: 1 }
            : {
                okay: true,
                result: `0x${serializeCV(Cl.ok(Cl.uint(1))).replace(/^0x/, "")}`,
              },
        ),
      );
    });
    vi.stubGlobal("fetch", http);
    await info();
    expect(ok(await read("agentic-commerce-v6", "get-job-count"))).toBe("1");
    expect(http).toHaveBeenCalledTimes(2);
    expect(http.mock.calls[1][0]).toBe(
      `${API}/v2/contracts/call-read/${DEPLOYER}/agentic-commerce-v6/get-job-count`,
    );
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(2900);
  }, 15000);
  it("serializes and spaces reads by three seconds, including concurrent callers", async () => {
    const f = fixture([
      new Response("{}"),
      new Response("{}"),
      new Response("{}"),
    ]);
    await Promise.all([
      f.read(`${API}/v2/info`),
      f.read(`${API}/v2/info`),
      f.read(`${API}/v2/info`),
    ]);
    expect(f.starts).toEqual([0, 3000, 6000]);
  });
  it("honors Retry-After seconds and preserves a read-only POST body", async () => {
    const f = fixture([limited("12"), new Response("{}")]);
    const body = JSON.stringify({
      sender: DEPLOYER,
      arguments: ["0x0100000000000000000000000000000001"],
    });
    await f.read(readonlyUrl, { method: "POST", body, redirect: "follow" });
    expect(f.starts).toEqual([0, 12000]);
    for (const [, options] of f.fetchFn.mock.calls as unknown as Array<
      [string, RequestInit]
    >) {
      expect(options).toMatchObject({
        method: "POST",
        body,
        redirect: "error",
      });
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it("honors an HTTP-date Retry-After", async () => {
    const f = fixture([
      limited(new Date(20000).toUTCString()),
      new Response("{}"),
    ]);
    await f.read(`${API}/v2/info`);
    expect(f.starts).toEqual([0, 20000]);
  });
  it("bounds retries to three attempts with exponential fallback delays", async () => {
    const f = fixture([limited(), limited(), limited()]);
    expect((await f.read(`${API}/v2/info`)).status).toBe(429);
    expect(f.starts).toEqual([0, 5000, 15000]);
  });
  it("stops instead of shortening a server cooldown longer than sixty seconds", async () => {
    const f = fixture([limited("120")]);
    await expect(f.read(`${API}/v2/info`)).rejects.toThrow(/60 seconds/);
    expect(f.fetchFn).toHaveBeenCalledTimes(1);
    expect(f.sleep).not.toHaveBeenCalled();
  });
  it("uses a conservative bounded cooldown for invalid hints", async () => {
    const f = fixture([limited("invalid"), new Response("{}")]);
    await f.read(`${API}/v2/info`);
    expect(f.starts).toEqual([0, 60000]);
  });
  it("does not shorten an overflowing numeric Retry-After", async () => {
    const f = fixture([limited("9".repeat(400))]);
    await expect(f.read(`${API}/v2/info`)).rejects.toThrow(/60 seconds/);
    expect(f.fetchFn).toHaveBeenCalledTimes(1);
    expect(f.sleep).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 500, 503])(
    "does not retry HTTP %s",
    async (status) => {
      const f = fixture([new Response("{}", { status })]);
      expect((await f.read(`${API}/v2/info`)).status).toBe(status);
      expect(f.fetchFn).toHaveBeenCalledTimes(1);
    },
  );
  it("does not retry transport errors and permits subsequent queued observations", async () => {
    const f = fixture([new Error("network failed"), new Response("{}")]);
    await expect(f.read(`${API}/v2/info`)).rejects.toThrow("network failed");
    expect((await f.read(`${API}/v2/info`)).ok).toBe(true);
    expect(f.fetchFn).toHaveBeenCalledTimes(2);
  });
  it("respects an already-aborted caller signal without issuing HTTP", async () => {
    const f = fixture([]),
      abort = new AbortController();
    abort.abort();
    await expect(
      f.read(`${API}/v2/info`, { signal: abort.signal }),
    ).rejects.toThrow();
    expect(f.fetchFn).not.toHaveBeenCalled();
  });
  it.each([
    ["https://api.mainnet.hiro.so/v2/info", {}],
    ["https://api.testnet.hiro.so.evil.example/v2/info", {}],
    ["https://user:password@api.testnet.hiro.so/v2/info", {}],
    [`${API}/v2/transactions`, { method: "POST", body: "signed-transaction" }],
    [`${API}/extended/v1/faucets/stx`, { method: "POST", body: "{}" }],
    [
      `${API}/v2/contracts/call-read/${DEPLOYER}/agentic-commerce-v6/fund-job`,
      { method: "POST", body: "{}" },
    ],
    [
      `${API}/v2/contracts/call-read/${DEPLOYER}/unreviewed/get-job`,
      { method: "POST", body: "{}" },
    ],
    [`${API}/v2/info`, { method: "DELETE" }],
    [`${API}/v2/info`, { method: "GET", body: "{}" }],
  ])("rejects unsafe destination or method: %s", async (url, options) => {
    const f = fixture([]);
    await expect(f.read(url, options)).rejects.toThrow();
    expect(f.fetchFn).not.toHaveBeenCalled();
  });
  it("keeps the broadcast network free of the read retry transport", () => {
    expect(NETWORK.client.baseUrl).toBe(API);
    expect(NETWORK.client.fetch).toBeUndefined();
  });
});
