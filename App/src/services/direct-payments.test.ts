import { describe, expect, it, vi } from "vitest";
import { loadDirectPayments, parseDirectPayments, formatAtomicAmount } from "./direct-payments";
import { NETWORK_NAME } from "../constants/network";
import { NAYORI_FACILITATOR_ORIGIN } from "../constants/discovery";
import { classifyEvidenceWallet } from "../constants/evidence";

const network = NETWORK_NAME === "mainnet" ? "stacks:1" : "stacks:2147483648";
const payment = { txid: `0x${"a".repeat(64)}`, protocol: "x402", asset: "STX", amountAtomic: "4000", decimals: 6,
  payer: "SP1VSKCGJCBV3EBS8GWPJ9FD1QARHQ9EN8S49PG8T", payTo: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH",
  feeMicroStx: "3000", blockHeight: 8911041, confirmedAt: "2026-09-03T12:00:00Z", deliveryStatus: "delivered" };
const snapshot = { schemaVersion: 1, network, generatedAt: "2026-09-03T13:00:00Z", dataStatus: "live",
  scope: "nayori-public-resources", limit: 25, hasMore: false, excludedCount: 0, payments: [payment] };

describe("direct payment public projection", () => {
  it("strips additional upstream fields", () => {
    const result = parseDirectPayments({ ...snapshot, secret: "SECRET", payments: [{ ...payment, settlementId: "SECRET" }] });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(result).toEqual(snapshot);
  });
  it.each([
    { network: network === "stacks:1" ? "stacks:2147483648" : "stacks:1" }, { schemaVersion: 2 },
    { scope: "all-merchants" }, { limit: 100 }, { dataStatus: "unavailable" }, { generatedAt: "bad" },
    { payments: [payment, payment] }, { payments: Array(26).fill(payment) }, { excludedCount: -1 },
  ])("rejects unsafe or cross-network snapshots %j", patch => {
    expect(() => parseDirectPayments({ ...snapshot, ...patch })).toThrow();
  });
  it.each([
    { amountAtomic: 4000 }, { amountAtomic: "1.5" }, { amountAtomic: "-1" }, { amountAtomic: "04" },
    { decimals: 8 }, { asset: "BTC" }, { protocol: "mpp" }, { txid: "javascript:alert(1)" },
    { payer: "<script>" }, { blockHeight: 0 }, { deliveryStatus: "success" }, { feeMicroStx: "NaN" },
  ])("rejects invalid payment fields %j", patch => {
    expect(() => parseDirectPayments({ ...snapshot, payments: [{ ...payment, ...patch }] })).toThrow();
  });
  it("keeps known internal mainnet payer separate from adoption", () => {
    if (NETWORK_NAME === "mainnet") expect(classifyEvidenceWallet(payment.payer)).toBe("team");
    expect(classifyEvidenceWallet("SPUNKNOWN")).toBe("unattested");
  });
  it.each([
    ["4000", 6, "0.004"], ["10000", 6, "0.01"], ["1", 8, "0.00000001"], ["0", 6, "0"],
    ["90071992547409931234", 6, "90,071,992,547,409.931234"],
    ["25000000000000000000000000000000000000000", 6, "25,000,000,000,000,000,000,000,000,000,000,000"],
  ])("formats %s atomic units with exact decimal arithmetic", (amount, decimals, expected) => {
    expect(formatAtomicAmount(amount as string, decimals as number)).toBe(expected);
  });
  it("uses only the fixed facilitator origin without user credentials", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json(snapshot));
    expect(await loadDirectPayments(request)).toEqual(snapshot);
    expect(request.mock.calls[0]?.[0]).toBe(`${NAYORI_FACILITATOR_ORIGIN}/v1/public/payments`);
    expect(request.mock.calls[0]?.[1]?.headers).toEqual({ accept: "application/json" });
    expect(request.mock.calls[0]?.[1]?.redirect).toBe("error");
  });
  it("fails closed for unavailable, oversized, malformed or wrong-network responses", async () => {
    for (const response of [new Response(null, { status: 503 }), new Response("x".repeat(65537)),
      Response.json({ ...snapshot, network: "wrong" }), new Response("not-json")]) {
      expect(await loadDirectPayments(async () => response)).toEqual({ schemaVersion: 1, network, dataStatus: "unavailable" });
    }
    expect(await loadDirectPayments(async () => { throw new Error("SECRET"); })).toEqual({ schemaVersion: 1, network, dataStatus: "unavailable" });
  });
});
