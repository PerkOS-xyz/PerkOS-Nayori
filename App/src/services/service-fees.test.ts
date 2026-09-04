import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Cl, type ClarityValue } from "@stacks/transactions";
import { describe, expect, it, vi } from "vitest";

const { readOnly } = vi.hoisted(() => ({ readOnly: vi.fn() }));
vi.mock("@stacks/transactions", async (original) => ({
  ...(await original<typeof import("@stacks/transactions")>()),
  fetchCallReadOnlyFunction: readOnly,
}));
vi.mock("../constants/network", () => ({
  NETWORK: "mainnet",
  NETWORK_NAME: "mainnet",
}));
vi.mock("../constants/contract", async (original) => ({
  ...(await original<typeof import("../constants/contract")>()),
  CONTRACT_ADDRESS: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH",
  STX_COMMERCE_CONTRACT_NAME: "agentic-commerce-v6",
  SBTC_COMMERCE_CONTRACT_NAME: "sbtc-commerce-v5",
  STX_COMMERCE_HAS_SERVICE_FEES: true,
  SBTC_COMMERCE_HAS_SERVICE_FEES: true,
  STX_COMMERCE_HAS_AUTONOMOUS_DECISIONS: true,
  SBTC_COMMERCE_HAS_AUTONOMOUS_DECISIONS: true,
  STX_COMMERCE_HAS_REVIEW_TIMEOUT: true,
  SBTC_COMMERCE_HAS_REVIEW_TIMEOUT: true,
  STX_COMMERCE_IS_HARDENED: true,
}));

import {
  feeAcceptanceKey,
  formatFeeAmount,
  getJobServiceFee,
  parseServiceFeeState,
  verifyFeeAction,
} from "./service-fees";
import { getCommerceJob, type CommerceJob } from "./commerce";
import ServiceFeeBreakdown from "../components/ServiceFeeBreakdown";

const CLIENT = "SP1VY24ADP27HERH4XMQTK44XB9QX4ZASPMPJKPVF";
const PROVIDER = "SP3DQCVZ26XCDGZFYB4TXJC6TMMZAVXZTER1DP8HV";
const EVALUATOR = "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE";
const AUTHORITY = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const TREASURY = "SP000000000000000000002Q6VF78";
const hash = "11".repeat(32);
type Fields = Record<string, ClarityValue>;
const job: CommerceJob = {
  id: 1,
  currency: "sbtc",
  status: 7,
  budget: 1000,
  client: CLIENT,
  provider: PROVIDER,
  evaluator: EVALUATOR,
  appealAuthority: AUTHORITY,
  treasury: TREASURY,
  description: "Fee fixture",
  expiredAt: 9000000,
};
const policy = (fields: Fields = {}) =>
  Cl.ok(
    Cl.tuple({
      configured: Cl.bool(true),
      "service-fee-bps": Cl.uint(200),
      treasury: Cl.principal(TREASURY),
      "review-window": Cl.uint(12),
      "appeal-window": Cl.uint(144),
      "appeal-authority": Cl.principal(AUTHORITY),
      ...fields,
    })
  );
const fee = (fields: Fields = {}) =>
  Cl.ok(
    Cl.tuple({
      "basis-points": Cl.uint(200),
      treasury: Cl.principal(TREASURY),
      "fee-amount": Cl.uint(20),
      "service-recorded": Cl.bool(true),
      waiver: Cl.none(),
      settlement: Cl.none(),
      ...fields,
    })
  );
const settlement = (fields: Fields = {}) =>
  Cl.some(
    Cl.tuple({
      gross: Cl.uint(1000),
      net: Cl.uint(980),
      recipient: Cl.principal(PROVIDER),
      "charged-fee": Cl.uint(20),
      "refunded-fee": Cl.uint(0),
      ...fields,
    })
  );
const parse = (fields: Fields = {}, j = job, config = policy()) =>
  parseServiceFeeState(fee(fields), config, j, "mainnet");

describe("native fee adapter and disclosure", () => {
  it.each([0, 1, 49, 50, 51, 999, 1000, Number.MAX_SAFE_INTEGER])(
    "matches contract/SDK rounding for %s atomic units",
    (gross) => {
      const amount = BigInt(gross);
      const f = parse(
        {
          "fee-amount": Cl.uint(amount / BigInt(50)),
          "service-recorded": Cl.bool(false),
        },
        { ...job, budget: gross, status: 0 }
      );
      expect(f.potentialFee).toBe(amount / BigInt(50));
      expect(f.gross).toBe(amount);
    }
  );
  it.each([
    { "basis-points": Cl.uint(201) },
    { "fee-amount": Cl.uint(21) },
    { treasury: Cl.principal(CLIENT) },
    { treasury: Cl.principal("ST000000000000000000002AMW42H") },
    { waiver: Cl.some(Cl.bufferFromHex("00".repeat(32))) },
    { waiver: Cl.some(Cl.bufferFromHex("11")) },
    { "service-recorded": Cl.bool(false) },
    { settlement: Cl.uint(1) },
  ])("rejects invalid accounting %#", (fields) =>
    expect(() => parse(fields)).toThrow()
  );
  it.each([
    { configured: Cl.bool(false) },
    { "service-fee-bps": Cl.uint(0) },
    { "appeal-window": Cl.uint(3) },
    { "review-window": Cl.uint(144) },
    { "appeal-authority": Cl.principal(TREASURY) },
  ])("rejects invalid protocol policy %#", (fields) =>
    expect(() => parse({}, job, policy(fields))).toThrow()
  );
  it("never turns unavailable or unsafe values into a zero fee", () => {
    expect(() =>
      parseServiceFeeState(Cl.error(Cl.uint(802)), policy(), job, "mainnet")
    ).toThrow();
    expect(() =>
      parseServiceFeeState(Cl.ok(Cl.tuple({})), policy(), job, "mainnet")
    ).toThrow();
    expect(() =>
      parse({}, { ...job, budget: Number.MAX_SAFE_INTEGER + 1 })
    ).toThrow();
    expect(() => parse({}, { ...job, status: 3 })).toThrow();
  });
  it("separates a waiver obligation from a completed refund", () => {
    const waived = {
      waiver: Cl.some(Cl.bufferFromHex(hash)),
      settlement: settlement(),
    };
    const f = parse(waived, { ...job, status: 3 });
    expect(f.settlement!.refundedFee).toBe(BigInt(0));
    expect(f.settlement!.net).toBe(BigInt(980));
    const refunded = parse(
      { ...waived, settlement: settlement({ "refunded-fee": Cl.uint(20) }) },
      { ...job, status: 3 }
    );
    expect(refunded.settlement!.net + refunded.settlement!.refundedFee).toBe(
      BigInt(1000)
    );
    expect(() =>
      parse(
        { settlement: settlement({ "refunded-fee": Cl.uint(20) }) },
        { ...job, status: 3 }
      )
    ).toThrow();
    expect(() =>
      parse(
        { ...waived, settlement: settlement({ "refunded-fee": Cl.uint(1) }) },
        { ...job, status: 3 }
      )
    ).toThrow();
    expect(() =>
      parse({ settlement: settlement() }, { ...job, status: 4 })
    ).toThrow();
    expect(
      parse(
        { settlement: settlement({ recipient: Cl.principal(CLIENT) }) },
        { ...job, status: 4 }
      ).settlement!.recipient
    ).toBe(CLIENT);
  });
  it("binds consent to wallet, job, amount, treasury, asset, status and waiver", () => {
    const snapshot = { ...job, serviceFee: parse() };
    const accepted = feeAcceptanceKey(snapshot, CLIENT);
    expect(() =>
      verifyFeeAction(snapshot, snapshot, CLIENT, accepted)
    ).not.toThrow();
    for (const fresh of [
      { ...snapshot, id: 2 },
      { ...snapshot, currency: "stx" as const },
      { ...snapshot, status: 8 },
      { ...snapshot, serviceFeeUnavailable: true },
      {
        ...snapshot,
        serviceFee: { ...snapshot.serviceFee, gross: BigInt(2000) },
      },
      {
        ...snapshot,
        serviceFee: { ...snapshot.serviceFee, treasury: AUTHORITY },
      },
      { ...snapshot, serviceFee: { ...snapshot.serviceFee, waiver: hash } },
    ])
      expect(() =>
        verifyFeeAction(snapshot, fresh, CLIENT, accepted)
      ).toThrow();
    expect(() =>
      verifyFeeAction(snapshot, snapshot, PROVIDER, accepted)
    ).toThrow();
    expect(() => verifyFeeAction(snapshot, snapshot, CLIENT, "")).toThrow();
  });
  it.each(["stx", "sbtc"] as const)(
    "reads both live getters for %s without a wallet",
    async (currency) => {
      readOnly
        .mockReset()
        .mockImplementation(async ({ functionName }) =>
          functionName === "get-protocol-config" ? policy() : fee()
        );
      expect((await getJobServiceFee(job, currency)).potentialFee).toBe(
        BigInt(20)
      );
      expect(readOnly).toHaveBeenCalledTimes(2);
    }
  );
  it("retains the job but marks its fee unavailable when RPC fails", async () => {
    readOnly.mockReset().mockImplementation(async ({ functionName }) => {
      if (functionName !== "get-job") throw new Error("RPC unavailable");
      return Cl.ok(
        Cl.tuple({
          client: Cl.principal(CLIENT),
          provider: Cl.none(),
          evaluator: Cl.principal(EVALUATOR),
          treasury: Cl.principal(TREASURY),
          "appeal-authority": Cl.principal(AUTHORITY),
          description: Cl.stringAscii("Fee fixture"),
          budget: Cl.uint(1000),
          "expired-at": Cl.uint(900000),
          status: Cl.uint(0),
          deliverable: Cl.none(),
        })
      );
    });
    const result = await getCommerceJob(1, "stx");
    expect(result?.serviceFeeUnavailable).toBe(true);
    expect(result?.serviceFee).toBeUndefined();
    expect(result?.budget).toBe(1000);
  });
  it("formats smallest units without float rounding", () => {
    expect(formatFeeAmount(BigInt(1), "sbtc")).toBe("0.00000001 sBTC");
    expect(formatFeeAmount(BigInt(20), "stx")).toBe("0.00002 STX");
    expect(formatFeeAmount(BigInt(100000000), "sbtc")).toBe("1 sBTC");
  });
  it("renders honest quote, net rejection, waiver, refund and unavailable states", () => {
    const render = (j: CommerceJob) =>
      renderToStaticMarkup(createElement(ServiceFeeBreakdown, { job: j }));
    expect(render(job)).toBe("");
    const quoted = render({ ...job, serviceFee: parse() });
    expect(quoted).toContain("quote, not collected revenue");
    expect(quoted).toContain("evaluated rejection refunds the client net");
    expect(quoted).toContain("Network gas is separate");
    const completed = { ...job, status: 3 };
    expect(
      render({
        ...completed,
        serviceFee: parse(
          { waiver: Cl.some(Cl.bufferFromHex(hash)), settlement: settlement() },
          completed
        ),
      })
    ).toContain("Refund outstanding");
    expect(
      render({
        ...completed,
        serviceFee: parse(
          {
            waiver: Cl.some(Cl.bufferFromHex(hash)),
            settlement: settlement({ "refunded-fee": Cl.uint(20) }),
          },
          completed
        ),
      })
    ).not.toContain("Refund outstanding");
    expect(render({ ...job, serviceFeeUnavailable: true })).toContain(
      "Filing an appeal is not blocked"
    );
  });
});
