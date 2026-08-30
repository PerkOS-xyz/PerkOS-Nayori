import { Cl, Pc } from "@stacks/transactions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { candidateAddress, pinnedToken, readOnly, request } = vi.hoisted(() => {
  const candidateAddress =
    process.env.NEXT_PUBLIC_STACKS_NETWORK === "testnet"
      ? "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5"
      : "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
  return {
    candidateAddress,
    pinnedToken: `${candidateAddress}.historical-sbtc`,
    readOnly: vi.fn(),
    request: vi.fn(),
  };
});

vi.mock("@stacks/transactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stacks/transactions")>();
  return { ...actual, fetchCallReadOnlyFunction: readOnly };
});
vi.mock("@stacks/connect", () => ({ request }));
vi.mock("../constants/contract", () => ({
  CONTRACT_ADDRESS: candidateAddress,
  SBTC_COMMERCE_CONTRACT_NAME: "sbtc-commerce-v3",
  SBTC_COMMERCE_HAS_REVIEW_TIMEOUT: true,
}));

import {
  SBTC_COMMERCE,
  completeSbtcJob,
} from "./sbtc-commerce";

describe("versioned sBTC settlement token pinning", () => {
  beforeEach(() => {
    readOnly.mockReset();
    request.mockReset();
  });

  it("uses the job-pinned token in the trait argument and exact post-condition", async () => {
    readOnly.mockResolvedValue(
      Cl.ok(
        Cl.contractPrincipal(
          candidateAddress,
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
            candidateAddress,
            "historical-sbtc"
          ),
        ],
        postConditionMode: "deny",
        postConditions: [
          Pc.principal(SBTC_COMMERCE)
            .willSendEq(125)
            .ft(pinnedToken as any, "sbtc-token"),
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
