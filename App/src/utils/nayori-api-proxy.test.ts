import { afterEach, describe, expect, it, vi } from "vitest";
import {
  proxyNayoriApiDiscovery,
  proxyNayoriMppResource,
  proxyNayoriPaidResource,
} from "./nayori-api-proxy";

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

describe("Nayori same-origin MPP PaymentAuth proxy", () => {
  it("forwards only the alternate payment credential and preserves MPP headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        expect(String(input)).toBe(
          "https://api.nayori.ai/mpp/v1?settlement=ns_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        );
        const headers = new Headers(init?.headers);
        expect(headers.get("payment-authorization")).toBe("Payment encoded-credential");
        expect(headers.get("x-nayori-signed-quote")).toBe("signed-quote");
        expect(headers.get("authorization")).toBeNull();
        expect(headers.get("cookie")).toBeNull();
        expect(headers.get("origin")).toBeNull();
        expect(headers.get("payment-signature")).toBeNull();
        return Response.json(
          { status: "pending" },
          {
            status: 202,
            headers: {
              Location: "https://nayori.ai/api/mpp/v1?settlement=ns_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              "Retry-After": "5",
              "X-NAYORI-SETTLEMENT-ID": "ns_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
          },
        );
      },
    );
    const response = await proxyNayoriMppResource(
      new Request(
        "https://nayori.ai/api/mpp/v1?settlement=ns_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        {
          headers: {
            Authorization: "Bearer must-not-leave-apex",
            Cookie: "session=must-not-leave-apex",
            Origin: "https://wallet.example",
            "Payment-Authorization": "Payment encoded-credential",
            "PAYMENT-SIGNATURE": "must-not-cross-protocols",
            "X-NAYORI-SIGNED-QUOTE": "signed-quote",
          },
        },
      ),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("access-control-expose-headers")).toContain("Payment-Receipt");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves PaymentAuth challenges and confirmed receipts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(
        { status: 402, payment: { method: "usdc" } },
        { status: 402, headers: { "WWW-Authenticate": "Payment challenge" } },
      ),
    );
    const challenge = await proxyNayoriMppResource(
      new Request("https://nayori.ai/api/mpp/v1"),
    );
    expect(challenge.status).toBe(402);
    expect(challenge.headers.get("www-authenticate")).toBe("Payment challenge");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(
        { payment: { protocol: "mpp-paymentauth" } },
        { status: 200, headers: { "Payment-Receipt": "Payment receipt" } },
      ),
    );
    const confirmed = await proxyNayoriMppResource(
      new Request("https://nayori.ai/api/mpp/v1?settlement=ns_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.headers.get("payment-receipt")).toBe("Payment receipt");
  });
});

describe("Nayori same-origin paid-resource proxy", () => {
  it("forwards only x402 protocol headers and preserves the upstream response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        expect(String(input)).toBe(
          "https://api.nayori.ai/v1?settlement=ns_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        );
        const headers = new Headers(init?.headers);
        expect(headers.get("payment-signature")).toBe("encoded-payment");
        expect(headers.get("x-nayori-signed-quote")).toBe("signed-quote");
        expect(headers.get("authorization")).toBeNull();
        expect(headers.get("cookie")).toBeNull();
        expect(headers.get("origin")).toBeNull();
        return Response.json(
          { status: "pending" },
          {
            status: 202,
            headers: {
              Location: "https://nayori.ai/api/v1?settlement=ns_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              "Retry-After": "5",
              "X-NAYORI-SETTLEMENT-ID": "ns_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
          },
        );
      },
    );
    const response = await proxyNayoriPaidResource(
      new Request(
        "https://nayori.ai/api/v1?settlement=ns_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        {
          headers: {
            Authorization: "Bearer must-not-leave-apex",
            Cookie: "session=must-not-leave-apex",
            Origin: "https://wallet.example",
            "PAYMENT-SIGNATURE": "encoded-payment",
            "X-NAYORI-SIGNED-QUOTE": "signed-quote",
          },
        },
      ),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("x-nayori-settlement-id")).toBe(
      "ns_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "PAYMENT-RESPONSE",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves 402 protocol challenges and fails closed when API is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(
        { x402Version: 2 },
        { status: 402, headers: { "PAYMENT-REQUIRED": "encoded-requirement" } },
      ),
    );
    const challenge = await proxyNayoriPaidResource(
      new Request("https://nayori.ai/api/v1"),
    );
    expect(challenge.status).toBe(402);
    expect(challenge.headers.get("payment-required")).toBe("encoded-requirement");

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    const unavailable = await proxyNayoriPaidResource(
      new Request("https://nayori.ai/api/v1"),
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({
      error: { code: "paid_resource_temporarily_unavailable" },
    });
  });
});
