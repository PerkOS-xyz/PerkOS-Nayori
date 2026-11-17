import { describe, expect, it } from "vitest";
import {
  acceptsApplications,
  blocksToDuration,
  deadlineText,
  durationToBitcoinBlocks,
  nextApplicationActions,
  nextApplicationEntryActions,
  nextJobActions,
  quoteNextFee,
  settlementPreview,
} from "./status";
import { statusName, type NextDecision, type NextJob } from "./parse";

const CLIENT = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const PROVIDER = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";
const EVALUATOR = "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC";
const TREASURY = "ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND";
const AUTHORITY = "ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0";
const STRANGER = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";

const job = (status: number, extra: Partial<NextJob> = {}): NextJob => ({
  id: 1,
  asset: "sbtc",
  client: CLIENT,
  evaluator: EVALUATOR,
  provider: status >= 2 ? PROVIDER : undefined,
  treasury: TREASURY,
  appealAuthority: AUTHORITY,
  budget: 50_000,
  description: "Work",
  deliveryDeadline: 1_000,
  deliveryBlocks: 144,
  reviewBlocks: 36,
  status,
  statusName: statusName(status),
  ...extra,
});

const decision = (kind: "approve" | "reject", extra: Partial<NextDecision> = {}): NextDecision => ({
  decision: kind,
  byDefault: false,
  evidenceHash: "ab".repeat(32),
  appealDeadline: 1_200,
  ...extra,
});

describe("next job actions by party", () => {
  it("lets the client fund an open job before the deadline, and anyone close it after", () => {
    expect(nextJobActions({ job: job(0), wallet: CLIENT, burnHeight: 999 })).toEqual(["fund"]);
    expect(nextJobActions({ job: job(0), wallet: STRANGER, burnHeight: 999 })).toEqual([]);
    expect(nextJobActions({ job: job(0), wallet: STRANGER, burnHeight: 1_000 })).toEqual(["close"]);
    expect(nextJobActions({ job: job(0), wallet: CLIENT, burnHeight: 1_000 })).toEqual(["close"]);
  });

  it("hides every time-gated action while the Bitcoin height is unknown", () => {
    expect(nextJobActions({ job: job(0), wallet: CLIENT, burnHeight: 0 })).toEqual([]);
    expect(nextJobActions({ job: job(3), wallet: PROVIDER, burnHeight: 0 })).toEqual([]);
  });

  it("lets the client offer and the named provider accept before the deadline", () => {
    expect(nextJobActions({ job: job(1), wallet: CLIENT, burnHeight: 500 })).toEqual(["name-provider"]);
    expect(nextJobActions({ job: job(2), wallet: CLIENT, burnHeight: 500 })).toEqual(["name-provider"]);
    expect(nextJobActions({ job: job(2), wallet: PROVIDER, burnHeight: 500 })).toEqual(["accept"]);
    expect(nextJobActions({ job: job(1, { provider: undefined }), wallet: PROVIDER, burnHeight: 500 })).toEqual([]);
  });

  it("refunds a funded, offered or accepted job after the deadline only with the full escrow", () => {
    for (const status of [1, 2, 3]) {
      expect(nextJobActions({ job: job(status), wallet: STRANGER, burnHeight: 1_000, escrow: 50_000 })).toEqual(["refund"]);
      expect(nextJobActions({ job: job(status), wallet: STRANGER, burnHeight: 1_000, escrow: 0 })).toEqual([]);
    }
  });

  it("lets the accepted provider submit before the delivery deadline", () => {
    expect(nextJobActions({ job: job(3), wallet: PROVIDER, burnHeight: 999 })).toEqual(["submit"]);
    expect(nextJobActions({ job: job(3), wallet: CLIENT, burnHeight: 999 })).toEqual([]);
  });

  it("lets the evaluator decide within the review window and anyone record a default approval after", () => {
    const submission = { deliverable: "aa", reviewDeadline: 1_100 };
    expect(nextJobActions({ job: job(4), wallet: EVALUATOR, burnHeight: 1_100, submission })).toEqual(["decide"]);
    expect(nextJobActions({ job: job(4), wallet: EVALUATOR, burnHeight: 1_101, submission })).toEqual(["default-approval"]);
    expect(nextJobActions({ job: job(4), wallet: STRANGER, burnHeight: 1_050, submission })).toEqual([]);
  });

  it("lets only the losing side appeal, then anyone settle after the appeal window", () => {
    expect(nextJobActions({ job: job(5), wallet: CLIENT, burnHeight: 1_200, decision: decision("approve") })).toEqual(["appeal"]);
    expect(nextJobActions({ job: job(5), wallet: PROVIDER, burnHeight: 1_200, decision: decision("approve") })).toEqual([]);
    expect(nextJobActions({ job: job(5), wallet: PROVIDER, burnHeight: 1_200, decision: decision("reject") })).toEqual(["appeal"]);
    expect(nextJobActions({ job: job(5), wallet: CLIENT, burnHeight: 1_200, decision: decision("reject") })).toEqual([]);
    expect(nextJobActions({ job: job(5), wallet: "", burnHeight: 1_201, decision: decision("approve"), escrow: 50_000 })).toEqual(["settle"]);
  });

  it("lets the appeal authority resolve a dispute in time, and anyone settle after", () => {
    const disputed = decision("reject", { appellant: PROVIDER, resolutionDeadline: 1_300 });
    expect(nextJobActions({ job: job(6), wallet: AUTHORITY, burnHeight: 1_300, decision: disputed })).toEqual(["resolve-appeal"]);
    expect(nextJobActions({ job: job(6), wallet: STRANGER, burnHeight: 1_300, decision: disputed })).toEqual([]);
    expect(nextJobActions({ job: job(6), wallet: STRANGER, burnHeight: 1_301, decision: disputed })).toEqual(["settle"]);
  });

  it("lets the client rate a completed job once and anyone replay a pending reputation update", () => {
    expect(nextJobActions({ job: job(7), wallet: CLIENT, burnHeight: 2_000, rated: false })).toEqual(["rate"]);
    expect(nextJobActions({ job: job(7), wallet: CLIENT, burnHeight: 2_000, rated: true })).toEqual([]);
    expect(nextJobActions({ job: job(8), wallet: STRANGER, burnHeight: 2_000, reputationPending: true })).toEqual(["retry-reputation"]);
  });

  it("offers nothing on final statuses", () => {
    for (const status of [9, 10]) {
      expect(nextJobActions({ job: job(status), wallet: CLIENT, burnHeight: 2_000 })).toEqual([]);
    }
  });
});

describe("next application actions", () => {
  const base = { job: job(1), burnHeight: 500, applications: [], isAgent: true };

  it("offers apply to eligible agents and registration to other wallets", () => {
    expect(nextApplicationActions({ ...base, wallet: STRANGER })).toEqual(["apply"]);
    expect(nextApplicationActions({ ...base, wallet: STRANGER, isAgent: false })).toEqual(["register"]);
    for (const party of [CLIENT, EVALUATOR, TREASURY, AUTHORITY]) {
      expect(nextApplicationActions({ ...base, wallet: party })).toEqual([]);
    }
    expect(nextApplicationActions({ ...base, wallet: STRANGER, burnHeight: 1_000 })).toEqual([]);
    expect(nextApplicationActions({ ...base, job: job(1, { asset: "stx" }), wallet: STRANGER })).toEqual([]);
  });

  it("lets an applicant withdraw at any time", () => {
    const applications = [{ applicant: STRANGER, deposit: 500 }];
    expect(nextApplicationActions({ ...base, applications, wallet: STRANGER })).toEqual(["withdraw"]);
    expect(nextApplicationActions({ ...base, job: job(7), applications, wallet: STRANGER })).toEqual(["withdraw"]);
  });

  it("lets the client offer or decline while the job takes applications, and anyone release after", () => {
    const entry = { applicant: STRANGER, deposit: 500 };
    expect(nextApplicationEntryActions({ job: job(1), wallet: CLIENT, burnHeight: 500 }, entry)).toEqual(["offer", "decline"]);
    expect(nextApplicationEntryActions({ job: job(0), wallet: CLIENT, burnHeight: 500 }, entry)).toEqual(["decline"]);
    expect(nextApplicationEntryActions({ job: job(1), wallet: STRANGER, burnHeight: 500 }, entry)).toEqual([]);
    expect(nextApplicationEntryActions({ job: job(3), wallet: STRANGER, burnHeight: 500 }, entry)).toEqual(["release"]);
  });

  it("stops taking applications at the deadline or after an offer is accepted", () => {
    expect(acceptsApplications(job(2), 999)).toBe(true);
    expect(acceptsApplications(job(2), 1_000)).toBe(false);
    expect(acceptsApplications(job(3), 500)).toBe(false);
  });
});

describe("next amounts and Bitcoin block deadlines", () => {
  it("quotes the 2% fee charged on every decision", () => {
    expect(quoteNextFee(50_000)).toEqual({ budget: 50_000, fee: 1_000, net: 49_000 });
    expect(quoteNextFee(1_000)).toEqual({ budget: 1_000, fee: 20, net: 980 });
    expect(settlementPreview(job(5), "approve")).toEqual({ winner: PROVIDER, net: 49_000, fee: 1_000, treasury: TREASURY });
    expect(settlementPreview(job(5), "reject").winner).toBe(CLIENT);
  });

  it("describes deadlines in Bitcoin blocks", () => {
    expect(deadlineText(1_144, 1_000)).toBe("144 Bitcoin blocks left (about 24 hours)");
    expect(deadlineText(1_000, 1_000)).toBe("Passed at Bitcoin block 1,000");
    expect(deadlineText(1_000, 1_000, true)).toBe("1 Bitcoin block left (about 10 minutes)");
    expect(deadlineText(1_000, 0)).toBe("Bitcoin block 1,000");
    expect(blocksToDuration(1_008)).toBe("about 7 days");
    expect(durationToBitcoinBlocks(1, "days")).toBe(144);
    expect(durationToBitcoinBlocks(6, "hours")).toBe(36);
  });
});
