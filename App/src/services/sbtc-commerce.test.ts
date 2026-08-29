import { beforeEach, describe, expect, it, vi } from "vitest";
import { Pc } from "@stacks/transactions";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@stacks/connect", () => ({ request }));

import {
  SBTC_COMMERCE,
  completeSbtcJob,
  expireSbtcJob,
  rejectSbtcJob,
  settleSbtcReviewTimeout,
} from "./sbtc-commerce";
import { SBTC_TOKEN } from "../constants/sbtc";

describe("sBTC settlement transaction policy", () => {
  beforeEach(() => request.mockReset());

  for (const [operation, invoke] of [
    ["complete-job", completeSbtcJob],
    ["reject-job", rejectSbtcJob],
    ["expire-job", expireSbtcJob],
    ["settle-review-timeout", settleSbtcReviewTimeout],
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
