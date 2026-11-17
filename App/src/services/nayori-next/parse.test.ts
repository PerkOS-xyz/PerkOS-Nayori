import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";
import {
  averageRating,
  parseNextAgent,
  parseNextApplication,
  parseNextApplications,
  parseNextDecision,
  parseNextJob,
  parseNextProviderStats,
  parseNextReputationPending,
  parseNextSubmission,
} from "./parse";

const CLIENT = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const PROVIDER = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";
const EVALUATOR = "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC";
const TREASURY = "ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND";
const AUTHORITY = "ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0";

const jobTuple = (status: number, provider?: string) =>
  Cl.some(
    Cl.tuple({
      client: Cl.principal(CLIENT),
      evaluator: Cl.principal(EVALUATOR),
      provider: provider ? Cl.some(Cl.principal(provider)) : Cl.none(),
      treasury: Cl.principal(TREASURY),
      "appeal-authority": Cl.principal(AUTHORITY),
      budget: Cl.uint(50_000),
      description: Cl.stringAscii("Translate the README"),
      "delivery-deadline": Cl.uint(900_144),
      "delivery-blocks": Cl.uint(144),
      "review-blocks": Cl.uint(36),
      status: Cl.uint(status),
    })
  );

describe("next contract read parsers", () => {
  it("parses a job with every new field and status name", () => {
    expect(parseNextJob(jobTuple(2, PROVIDER), "sbtc", 7)).toEqual({
      id: 7,
      asset: "sbtc",
      client: CLIENT,
      evaluator: EVALUATOR,
      provider: PROVIDER,
      treasury: TREASURY,
      appealAuthority: AUTHORITY,
      budget: 50_000,
      description: "Translate the README",
      deliveryDeadline: 900_144,
      deliveryBlocks: 144,
      reviewBlocks: 36,
      status: 2,
      statusName: "offered",
    });
    expect(parseNextJob(jobTuple(0), "stx", 1)?.provider).toBeUndefined();
    expect(parseNextJob(Cl.none(), "sbtc", 99)).toBeNull();
  });

  it("maps all eleven statuses and rejects unknown ones", () => {
    const names = Array.from({ length: 11 }, (_, code) => parseNextJob(jobTuple(code), "sbtc", 1)?.statusName);
    expect(names).toEqual([
      "open", "funded", "offered", "accepted", "submitted", "decided",
      "disputed", "completed", "rejected", "refunded", "expired",
    ]);
    expect(() => parseNextJob(jobTuple(11), "sbtc", 1)).toThrow(/Unknown next-generation job status/);
  });

  it("fails loudly on a shape from another contract generation", () => {
    expect(() => parseNextJob(Cl.ok(Cl.uint(1)), "sbtc", 1)).toThrow(/optional/);
    expect(() => parseNextJob(Cl.some(Cl.tuple({ client: Cl.uint(1) })), "sbtc", 1)).toThrow(/Unexpected/);
  });

  it("parses submissions and decisions, including appeals and default approvals", () => {
    expect(
      parseNextSubmission(
        Cl.some(Cl.tuple({ deliverable: Cl.bufferFromHex("aa".repeat(32)), "review-deadline": Cl.uint(900_200) }))
      )
    ).toEqual({ deliverable: "aa".repeat(32), reviewDeadline: 900_200 });
    expect(parseNextSubmission(Cl.none())).toBeNull();

    expect(
      parseNextDecision(
        Cl.some(
          Cl.tuple({
            decision: Cl.uint(1),
            "by-default": Cl.bool(true),
            "evidence-hash": Cl.bufferFromHex("00".repeat(32)),
            "appeal-deadline": Cl.uint(900_350),
            appellant: Cl.none(),
            "resolution-deadline": Cl.none(),
          })
        )
      )
    ).toEqual({ decision: "approve", byDefault: true, evidenceHash: "00".repeat(32), appealDeadline: 900_350 });

    expect(
      parseNextDecision(
        Cl.some(
          Cl.tuple({
            decision: Cl.uint(2),
            "by-default": Cl.bool(false),
            "evidence-hash": Cl.bufferFromHex("bb".repeat(32)),
            "appeal-deadline": Cl.uint(900_350),
            appellant: Cl.some(Cl.principal(PROVIDER)),
            "resolution-deadline": Cl.some(Cl.uint(900_400)),
          })
        )
      )
    ).toEqual({
      decision: "reject",
      byDefault: false,
      evidenceHash: "bb".repeat(32),
      appealDeadline: 900_350,
      appellant: PROVIDER,
      resolutionDeadline: 900_400,
    });
  });

  it("parses provider stats with non-deliveries and value per asset", () => {
    const stats = parseNextProviderStats(
      Cl.tuple({
        completed: Cl.uint(4),
        rejected: Cl.uint(1),
        "not-delivered": Cl.uint(2),
        "completed-value-sbtc": Cl.uint(200_000),
        "completed-value-stx": Cl.uint(5_000_000),
        "distinct-clients": Cl.uint(3),
        "rating-sum": Cl.uint(18),
        "rating-count": Cl.uint(4),
      })
    );
    expect(stats).toEqual({
      completed: 4,
      rejected: 1,
      notDelivered: 2,
      completedValueSbtc: 200_000,
      completedValueStx: 5_000_000,
      distinctClients: 3,
      ratingSum: 18,
      ratingCount: 4,
    });
    expect(averageRating(stats)).toBe(4.5);
    expect(averageRating({ ...stats, ratingSum: 0, ratingCount: 0 })).toBeNull();
  });

  it("parses the deposit-sorted application list and single entries", () => {
    const entry = (applicant: string, deposit: number) =>
      Cl.tuple({ applicant: Cl.principal(applicant), deposit: Cl.uint(deposit) });
    expect(parseNextApplications(Cl.list([entry(PROVIDER, 5_000), entry(TREASURY, 100)]))).toEqual([
      { applicant: PROVIDER, deposit: 5_000 },
      { applicant: TREASURY, deposit: 100 },
    ]);
    expect(parseNextApplications(Cl.list([]))).toEqual([]);
    expect(parseNextApplication(Cl.some(entry(PROVIDER, 5_000)))).toEqual({ applicant: PROVIDER, deposit: 5_000 });
    expect(parseNextApplication(Cl.none())).toBeNull();
  });

  it("parses agents and pending reputation updates", () => {
    expect(
      parseNextAgent(
        Cl.some(Cl.tuple({ name: Cl.stringAscii("Scout"), uri: Cl.stringAscii(""), "registered-at": Cl.uint(900_000) })),
        PROVIDER
      )
    ).toEqual({ wallet: PROVIDER, name: "Scout", uri: "", registeredAt: 900_000 });
    expect(parseNextAgent(Cl.none(), PROVIDER)).toBeNull();
    expect(
      parseNextReputationPending(
        Cl.some(
          Cl.tuple({
            provider: Cl.principal(PROVIDER),
            client: Cl.principal(CLIENT),
            completed: Cl.bool(true),
            value: Cl.uint(50_000),
          })
        )
      )
    ).toEqual({ provider: PROVIDER, client: CLIENT, completed: true, value: 50_000 });
  });
});
