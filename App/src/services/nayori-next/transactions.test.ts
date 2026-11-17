import { beforeEach, describe, expect, it, vi } from "vitest";
import { Cl, Pc } from "@stacks/transactions";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@stacks/connect", () => ({ request, getLocalStorage: () => null }));

import { NEXT_SBTC_TOKENS, resolveNextConfig } from "../../constants/nayori-next";
import {
  buildAcceptJob,
  buildAppeal,
  buildApplyToJob,
  buildCloseUnfunded,
  buildCreateJob,
  buildDeclineApplication,
  buildFundJob,
  buildNameProvider,
  buildRateProvider,
  buildRecordDecision,
  buildRecordDefaultApproval,
  buildRefundNoDelivery,
  buildRegisterAgent,
  buildReleaseApplication,
  buildResolveAppeal,
  buildRetryReputation,
  buildSettleJob,
  buildSubmitWork,
  buildWithdrawApplication,
  deliverableCommitment,
  hash32,
  sendNextCall,
  textDigestHex,
} from "./transactions";

const DEPLOYER = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const CLIENT = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const PROVIDER = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";
const EVALUATOR = "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC";
const config = resolveNextConfig({ deployer: DEPLOYER, network: "testnet" }, "testnet");
const ESCROW_SBTC = `${DEPLOYER}.nayori-escrow-sbtc`;
const ESCROW_STX = `${DEPLOYER}.nayori-escrow-stx`;
const APPLICATIONS = `${DEPLOYER}.nayori-applications`;
const SBTC = NEXT_SBTC_TOKENS.testnet;
const HASH = "ab".repeat(32);

describe("next escrow payloads", () => {
  it("creates a job in one call with no token parameter and no transfers", () => {
    const call = buildCreateJob(
      {
        asset: "sbtc",
        evaluator: EVALUATOR,
        budget: 50_000,
        deliveryBlocks: 144,
        reviewBlocks: 144,
        description: "Translate the README",
        client: CLIENT,
      },
      config
    );
    expect(call).toEqual({
      contract: ESCROW_SBTC,
      functionName: "create-job",
      functionArgs: [
        Cl.principal(EVALUATOR),
        Cl.uint(50_000),
        Cl.uint(144),
        Cl.uint(144),
        Cl.stringAscii("Translate the README"),
      ],
      postConditions: [],
      postConditionMode: "deny",
      network: "testnet",
    });
  });

  it("checks create-job inputs against the contract bounds", () => {
    const base = {
      asset: "sbtc" as const,
      evaluator: EVALUATOR,
      budget: 50_000,
      deliveryBlocks: 144,
      reviewBlocks: 144,
      description: "Work",
    };
    expect(() => buildCreateJob({ ...base, budget: 999 }, config)).toThrow(/Budget in sats/);
    expect(() => buildCreateJob({ ...base, budget: 100_000_001 }, config)).toThrow(/Budget in sats/);
    expect(() => buildCreateJob({ ...base, asset: "stx", budget: 999_999 }, config)).toThrow(/micro-STX/);
    expect(() => buildCreateJob({ ...base, deliveryBlocks: 143 }, config)).toThrow(/Delivery window/);
    expect(() => buildCreateJob({ ...base, deliveryBlocks: 4_321 }, config)).toThrow(/Delivery window/);
    expect(() => buildCreateJob({ ...base, reviewBlocks: 11 }, config)).toThrow(/Review window/);
    expect(() => buildCreateJob({ ...base, reviewBlocks: 1_009 }, config)).toThrow(/Review window/);
    expect(() => buildCreateJob({ ...base, description: "  " }, config)).toThrow(/description/);
    expect(() => buildCreateJob({ ...base, description: "x".repeat(513) }, config)).toThrow(/512/);
    expect(() => buildCreateJob({ ...base, description: "café" }, config)).toThrow(/ASCII/);
    expect(() => buildCreateJob({ ...base, client: EVALUATOR }, config)).toThrow(/different wallet/);
    expect(() =>
      buildCreateJob({ ...base, evaluator: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH" }, config)
    ).toThrow(/testnet Stacks address/);
  });

  it("binds funding to exactly the budget from the client, in sBTC or STX", () => {
    const sbtc = buildFundJob({ asset: "sbtc", jobId: 3, budget: 50_000, sender: CLIENT }, config);
    expect(sbtc.functionName).toBe("fund-job");
    expect(sbtc.functionArgs).toEqual([Cl.uint(3)]);
    expect(sbtc.postConditionMode).toBe("deny");
    expect(sbtc.postConditions).toEqual([
      Pc.principal(CLIENT).willSendEq(50_000).ft(SBTC, "sbtc-token"),
    ]);

    const stx = buildFundJob({ asset: "stx", jobId: 3, budget: 2_000_000, sender: CLIENT }, config);
    expect(stx.contract).toBe(ESCROW_STX);
    expect(stx.postConditions).toEqual([Pc.principal(CLIENT).willSendEq(2_000_000).ustx()]);
  });

  for (const [name, build, fn] of [
    ["settle-job", buildSettleJob, "settle-job"],
    ["refund-no-delivery", buildRefundNoDelivery, "refund-no-delivery"],
  ] as const) {
    it(`${name} binds the escrow to an outflow of exactly the budget`, () => {
      const call = build({ asset: "sbtc", jobId: 9, budget: 50_000 }, config);
      expect(call.functionName).toBe(fn);
      expect(call.functionArgs).toEqual([Cl.uint(9)]);
      expect(call.postConditionMode).toBe("deny");
      expect(call.postConditions).toEqual([
        Pc.principal(ESCROW_SBTC).willSendEq(50_000).ft(SBTC, "sbtc-token"),
      ]);
      const stx = build({ asset: "stx", jobId: 9, budget: 2_000_000 }, config);
      expect(stx.postConditions).toEqual([Pc.principal(ESCROW_STX).willSendEq(2_000_000).ustx()]);
    });
  }

  it("resolves an appeal with the decision, a 32-byte hash and the exact payout", () => {
    const call = buildResolveAppeal(
      { asset: "sbtc", jobId: 4, budget: 50_000, decision: "reject", resolutionHash: `0x${HASH}` },
      config
    );
    expect(call.functionName).toBe("resolve-appeal");
    expect(call.functionArgs).toEqual([Cl.uint(4), Cl.uint(2), Cl.bufferFromHex(HASH)]);
    expect(call.postConditions).toEqual([
      Pc.principal(ESCROW_SBTC).willSendEq(50_000).ft(SBTC, "sbtc-token"),
    ]);
  });

  it("sends calls that move no funds with no post-conditions in deny mode", () => {
    const calls = [
      buildNameProvider({ asset: "sbtc", jobId: 1, provider: PROVIDER, parties: [CLIENT, EVALUATOR] }, config),
      buildAcceptJob({ asset: "sbtc", jobId: 1 }, config),
      buildSubmitWork({ asset: "sbtc", jobId: 1, deliverable: new Uint8Array(32).fill(7) }, config),
      buildRecordDecision({ asset: "sbtc", jobId: 1, decision: "approve", evidenceHash: HASH }, config),
      buildRecordDefaultApproval({ asset: "sbtc", jobId: 1 }, config),
      buildAppeal({ asset: "sbtc", jobId: 1, evidenceHash: HASH }, config),
      buildCloseUnfunded({ asset: "sbtc", jobId: 1 }, config),
      buildRateProvider({ asset: "sbtc", jobId: 1, score: 5 }, config),
      buildRetryReputation({ asset: "sbtc", jobId: 1 }, config),
    ];
    expect(calls.map((call) => call.functionName)).toEqual([
      "name-provider",
      "accept-job",
      "submit-work",
      "record-decision",
      "record-default-approval",
      "appeal",
      "close-unfunded",
      "rate-provider",
      "retry-reputation",
    ]);
    for (const call of calls) {
      expect(call.postConditions).toEqual([]);
      expect(call.postConditionMode).toBe("deny");
      expect(call.contract).toBe(ESCROW_SBTC);
    }
    expect(calls[3].functionArgs).toEqual([Cl.uint(1), Cl.uint(1), Cl.bufferFromHex(HASH)]);
  });

  it("rejects inputs the contract would refuse", () => {
    expect(() =>
      buildNameProvider({ asset: "sbtc", jobId: 1, provider: CLIENT, parties: [CLIENT] }, config)
    ).toThrow(/cannot be the client/);
    expect(() => buildRecordDecision({ asset: "sbtc", jobId: 1, decision: "approve", evidenceHash: "00".repeat(32) }, config)).toThrow(/non-zero/);
    expect(() => buildAppeal({ asset: "sbtc", jobId: 1, evidenceHash: "abc" }, config)).toThrow(/32-byte/);
    expect(() => buildRateProvider({ asset: "sbtc", jobId: 1, score: 6 }, config)).toThrow(/Rating/);
    expect(() => buildSubmitWork({ asset: "sbtc", jobId: 1, deliverable: new Uint8Array(65) }, config)).toThrow(/1 to 64 bytes/);
    expect(() => buildAcceptJob({ asset: "sbtc", jobId: 0 }, config)).toThrow(/Job id/);
    expect(() => buildSettleJob({ asset: "sbtc", jobId: 1, budget: 0 }, config)).toThrow(/Budget/);
  });

  it("refuses to build anything while the next generation is off", () => {
    const off = resolveNextConfig({}, "testnet");
    expect(() => buildAcceptJob({ asset: "sbtc", jobId: 1 }, off)).toThrow(/not enabled/);
  });
});

describe("next application payloads", () => {
  it("binds the applicant to the exact deposit and caps any displaced refund at it", () => {
    const call = buildApplyToJob({ jobId: 5, deposit: 2_500, sender: PROVIDER }, config);
    expect(call.contract).toBe(APPLICATIONS);
    expect(call.functionName).toBe("apply-to-job");
    expect(call.functionArgs).toEqual([Cl.uint(5), Cl.uint(2_500)]);
    expect(call.postConditionMode).toBe("deny");
    expect(call.postConditions).toEqual([
      Pc.principal(PROVIDER).willSendEq(2_500).ft(SBTC, "sbtc-token"),
      Pc.principal(APPLICATIONS).willSendLte(2_500).ft(SBTC, "sbtc-token"),
    ]);
  });

  it("keeps deposits within 100 to 1,000,000 sats", () => {
    expect(() => buildApplyToJob({ jobId: 5, deposit: 99, sender: PROVIDER }, config)).toThrow(/Deposit/);
    expect(() => buildApplyToJob({ jobId: 5, deposit: 1_000_001, sender: PROVIDER }, config)).toThrow(/Deposit/);
  });

  it("returns exactly the recorded deposit on withdraw, decline and release", () => {
    const input = { jobId: 5, applicant: PROVIDER, deposit: 2_500 };
    const withdraw = buildWithdrawApplication(input, config);
    const decline = buildDeclineApplication(input, config);
    const release = buildReleaseApplication(input, config);
    expect(withdraw.functionName).toBe("withdraw");
    expect(withdraw.functionArgs).toEqual([Cl.uint(5)]);
    expect(decline.functionName).toBe("decline");
    expect(decline.functionArgs).toEqual([Cl.uint(5), Cl.principal(PROVIDER)]);
    expect(release.functionName).toBe("release");
    expect(release.functionArgs).toEqual([Cl.uint(5), Cl.principal(PROVIDER)]);
    for (const call of [withdraw, decline, release]) {
      expect(call.contract).toBe(APPLICATIONS);
      expect(call.postConditionMode).toBe("deny");
      expect(call.postConditions).toEqual([
        Pc.principal(APPLICATIONS).willSendEq(2_500).ft(SBTC, "sbtc-token"),
      ]);
    }
  });

  it("registers an agent with a name and link", () => {
    const call = buildRegisterAgent({ name: "Scout", uri: "https://example.com/agent.json" }, config);
    expect(call.contract).toBe(`${DEPLOYER}.nayori-agents`);
    expect(call.functionName).toBe("register");
    expect(call.functionArgs).toEqual([
      Cl.stringAscii("Scout"),
      Cl.stringAscii("https://example.com/agent.json"),
    ]);
    expect(call.postConditions).toEqual([]);
    expect(() => buildRegisterAgent({ name: "", uri: "" }, config)).toThrow(/agent name/);
  });
});

describe("next signing helpers", () => {
  beforeEach(() => {
    request.mockReset();
  });

  it("forwards the payload to the wallet unchanged", async () => {
    request.mockResolvedValue({ txid: "0xabc" });
    const call = buildFundJob({ asset: "sbtc", jobId: 3, budget: 50_000, sender: CLIENT }, config);
    await sendNextCall(call);
    expect(request).toHaveBeenCalledWith("stx_callContract", call);
  });

  it("hashes deliverables and notes with SHA-256", async () => {
    const bytes = await deliverableCommitment(" ipfs://cid ");
    expect(bytes).toHaveLength(32);
    expect(await textDigestHex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    await expect(deliverableCommitment("  ")).rejects.toThrow(/deliverable/);
    expect(hash32(HASH)).toEqual(Cl.bufferFromHex(HASH));
  });
});
