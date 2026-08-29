import { Cl, Pc } from "@stacks/transactions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readOnly, request } = vi.hoisted(() => ({
  readOnly: vi.fn(),
  request: vi.fn(),
}));

vi.mock("@stacks/transactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stacks/transactions")>();
  return { ...actual, fetchCallReadOnlyFunction: readOnly };
});
vi.mock("@stacks/connect", () => ({ request }));
vi.mock("../constants/contract", () => ({
  CONTRACT_ADDRESS: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH",
  SBTC_COMMERCE_CONTRACT_NAME: "sbtc-commerce-v2",
  SBTC_COMMERCE_HAS_REVIEW_TIMEOUT: true,
}));

import {
  SBTC_COMMERCE,
  completeSbtcJob,
} from "./sbtc-commerce";

const PINNED_TOKEN =
  "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.historical-sbtc";

describe("versioned sBTC settlement token pinning", () => {
  beforeEach(() => {
    readOnly.mockReset();
    request.mockReset();
  });

  it("uses the job-pinned token in the trait argument and exact post-condition", async () => {
    readOnly.mockResolvedValue(
      Cl.ok(
        Cl.contractPrincipal(
          "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH",
          "historical-sbtc"
        )
      )
    );
    request.mockResolvedValue({ txid: "0xabc" });

    await completeSbtcJob(7, 125);

    expect(readOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "get-job-payment-token",
        functionArgs: [Cl.uint(7)],
      })
    );
    expect(request).toHaveBeenCalledWith(
      "stx_callContract",
      expect.objectContaining({
        contract: SBTC_COMMERCE,
        functionName: "complete-job",
        functionArgs: [
          Cl.uint(7),
          Cl.contractPrincipal(
            "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH",
            "historical-sbtc"
          ),
        ],
        postConditionMode: "deny",
        postConditions: [
          Pc.principal(SBTC_COMMERCE)
            .willSendEq(125)
            .ft(PINNED_TOKEN as any, "sbtc-token"),
        ],
      })
    );
  });

  it("fails closed before the wallet when the funded job token cannot be verified", async () => {
    readOnly.mockResolvedValue(Cl.error(Cl.uint(724)));

    await expect(completeSbtcJob(7, 125)).rejects.toThrow(/pinned/i);
    expect(request).not.toHaveBeenCalled();
  });
});
