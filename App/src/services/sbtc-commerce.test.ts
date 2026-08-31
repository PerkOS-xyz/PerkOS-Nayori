import { beforeEach, describe, expect, it, vi } from "vitest";
import { Cl, Pc } from "@stacks/transactions";

const { readOnly, request } = vi.hoisted(() => ({
  readOnly: vi.fn(),
  request: vi.fn(),
}));
vi.mock("@stacks/transactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stacks/transactions")>();
  return { ...actual, fetchCallReadOnlyFunction: readOnly };
});
vi.mock("@stacks/connect", () => ({ request }));

import {
  SBTC_COMMERCE,
  completeSbtcJob,
  expireSbtcJob,
  finalizeSbtcDecision,
  rejectSbtcJob,
  resolveSbtcAppeal,
  settleSbtcAppealTimeout,
  settleSbtcReviewTimeout,
} from "./sbtc-commerce";
import { SBTC_TOKEN } from "../constants/sbtc";

describe("sBTC settlement transaction policy", () => {
  beforeEach(() => {
    const [address, name] = SBTC_TOKEN.split(".");
    readOnly.mockReset();
    readOnly.mockResolvedValue(Cl.ok(Cl.contractPrincipal(address, name)));
    request.mockReset();
  });

  for (const [operation, invoke] of [
    ["complete-job", completeSbtcJob],
    ["reject-job", rejectSbtcJob],
    ["expire-job", expireSbtcJob],
    ["settle-review-timeout", settleSbtcReviewTimeout],
    ["finalize-decision", finalizeSbtcDecision],
    ["settle-appeal-timeout", settleSbtcAppealTimeout],
  ] as const) {
    it(`${operation} constrains the exact escrow outflow in deny mode`, async () => {
      request.mockResolvedValue({ txid: "0xabc" });
      await invoke(7, 125);

      expect(request).toHaveBeenCalledOnce();
      const [, options] = request.mock.calls[0];
      expect(options).toEqual(expect.objectContaining({
        contract: SBTC_COMMERCE,
        functionName: operation,
        postConditionMode: "deny",
        postConditions: [
          Pc.principal(SBTC_COMMERCE)
            .willSendEq(125)
            .ft(SBTC_TOKEN as any, "sbtc-token"),
        ],
      }));
    });
  }

  it("rejects a zero completion amount before opening the wallet", async () => {
    await expect(completeSbtcJob(7, 0)).rejects.toThrow(/positive safe integer/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("resolves an appeal with a 32-byte commitment and exact escrow outflow", async () => {
    request.mockResolvedValue({ txid: "0xabc" });
    const digest = "33".repeat(32);

    await resolveSbtcAppeal(7, 2, digest, 125);

    const [, options] = request.mock.calls[0];
    expect(options).toEqual(expect.objectContaining({
      functionName: "resolve-appeal",
      postConditionMode: "deny",
      postConditions: [
        Pc.principal(SBTC_COMMERCE)
          .willSendEq(125)
          .ft(SBTC_TOKEN as any, "sbtc-token"),
      ],
    }));
    expect(options.functionArgs).toHaveLength(4);
    expect(options.functionArgs[2]).toEqual(Cl.bufferFromHex(digest));
  });

  it("allows zero-outflow expiry without an asset post-condition", async () => {
    request.mockResolvedValue({ txid: "0xabc" });

    await expireSbtcJob(7, 0);

    const [, options] = request.mock.calls[0];
    expect(options).toEqual(expect.objectContaining({
      functionName: "expire-job",
      postConditionMode: "deny",
      postConditions: [],
    }));
  });
});
