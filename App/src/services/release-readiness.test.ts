import { describe, expect, it } from "vitest";
import { resolveNetworkName } from "../constants/network";
import { STX_COMMERCE_HAS_AUTONOMOUS_DECISIONS } from "../constants/contract";
import {
  isStxAddressForNetwork,
  selectStxAddressForNetwork,
} from "./wallet";
import {
  canOfferRating,
  autonomousPermissions,
  appealDeadlineText,
  CommerceJob,
  jobPermissions,
  reviewDeadlineText,
  reviewPermissions,
  RatingAvailability,
} from "./commerce";

const MAINNET = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const TESTNET = "ST2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPJG0N53H";

describe("network configuration", () => {
  it("defaults to mainnet only when no value is configured", () => {
    expect(resolveNetworkName()).toBe("mainnet");
    expect(resolveNetworkName("mainnet")).toBe("mainnet");
    expect(resolveNetworkName("testnet")).toBe("testnet");
  });

  it("rejects misspelled or unsupported networks", () => {
    expect(() => resolveNetworkName("test")).toThrow(
      'must be "mainnet" or "testnet"'
    );
  });
});

describe("autonomous decision and appeal actions", () => {
  const client = MAINNET;
  const provider = "SP000000000000000000002Q6VF78";
  const authority = "SP000000000000000000002Q6VF77";
  const pending: CommerceJob = {
    id: 11,
    client,
    provider,
    evaluator: "SP000000000000000000002Q6VF79",
    appealAuthority: authority,
    description: "Autonomous decision test",
    budget: 1_000_000,
    expiredAt: 2_000,
    status: 7,
    currency: "stx",
    decision: {
      originalDecision: 1,
      evidenceHash: "11".repeat(32),
      explanationHash: "22".repeat(32),
      decidedAtBurn: 900_000,
      appealDeadline: 900_003,
    },
  };

  it("allows only the decision-specific party to appeal through the exact boundary", () => {
    expect(autonomousPermissions(pending, 900_003, client).canAppeal).toBe(true);
    expect(autonomousPermissions(pending, 900_003, provider).canAppeal).toBe(false);
    expect(autonomousPermissions(pending, 900_004, client).canAppeal).toBe(false);
  });

  it("makes unappealed finalization permissionless only after the boundary", () => {
    expect(autonomousPermissions(pending, 900_003, MAINNET).canFinalize).toBe(false);
    expect(autonomousPermissions(pending, 900_004, MAINNET).canFinalize).toBe(true);
  });

  it("separates human resolution from permissionless appeal-timeout settlement", () => {
    const disputed: CommerceJob = {
      ...pending,
      status: 8,
      decision: { ...pending.decision!, resolutionDeadline: 900_006 },
    };
    expect(autonomousPermissions(disputed, 900_006, authority).canResolve).toBe(true);
    expect(autonomousPermissions(disputed, 900_006, client).canResolve).toBe(false);
    expect(
      autonomousPermissions(disputed, 900_007, MAINNET).canSettleAppealTimeout
    ).toBe(true);
  });

  it("labels appeal and resolution deadlines in Bitcoin blocks", () => {
    expect(appealDeadlineText("Appeal", 900_003, 900_003)).toMatch(/Appeal deadline/);
    expect(appealDeadlineText("Resolution", 900_006, 900_007)).toMatch(/passed/);
  });
});

describe("wallet address selection", () => {
  const addresses = [{ address: MAINNET }, { address: TESTNET }];

  it("recognizes the address prefixes for each Stacks network", () => {
    expect(isStxAddressForNetwork(MAINNET, "mainnet")).toBe(true);
    expect(isStxAddressForNetwork(TESTNET, "testnet")).toBe(true);
    expect(isStxAddressForNetwork(MAINNET, "testnet")).toBe(false);
    expect(isStxAddressForNetwork(TESTNET, "mainnet")).toBe(false);
  });

  it("selects the address matching the configured network", () => {
    expect(selectStxAddressForNetwork(addresses, "mainnet")).toBe(MAINNET);
    expect(selectStxAddressForNetwork(addresses, "testnet")).toBe(TESTNET);
  });

  it("returns no address when the wallet only exposes another network", () => {
    expect(
      selectStxAddressForNetwork([{ address: MAINNET }], "testnet")
    ).toBe("");
  });
});

describe("consumed rating actions", () => {
  const completedJob: CommerceJob = {
    id: 1,
    client: MAINNET,
    provider: "SP000000000000000000002Q6VF78",
    evaluator: "SP000000000000000000002Q6VF79",
    description: "Release-readiness test",
    budget: 1_000_000,
    expiredAt: 1_000,
    status: 3,
    currency: "stx",
  };

  it("grants rating permission only to a completed job's client or evaluator", () => {
    expect(jobPermissions(completedJob, MAINNET).canRate).toBe(true);
    expect(
      jobPermissions(completedJob, "SP000000000000000000002Q6VF70").canRate
    ).toBe(false);
  });

  it.each<RatingAvailability>([
    "checking",
    "rated",
    "unavailable",
  ])("does not offer rating while its state is %s", (state) => {
    expect(canOfferRating(true, state)).toBe(false);
  });

  it("offers rating only after the on-chain check reports it available", () => {
    expect(canOfferRating(true, "available")).toBe(true);
    expect(canOfferRating(false, "available")).toBe(false);
  });
});

describe("versioned review timeout actions", () => {
  const submittedJob: CommerceJob = {
    id: 9,
    client: MAINNET,
    provider: "SP000000000000000000002Q6VF78",
    evaluator: "SP000000000000000000002Q6VF79",
    description: "Bitcoin-height review test",
    budget: 1_000_000,
    expiredAt: 1_000,
    status: 2,
    submittedAtBurn: 900_000,
    reviewDeadline: 900_144,
    currency: "stx",
  };

  it("keeps legacy evaluator settlement only when the selected generation supports it", () => {
    expect(
      reviewPermissions(submittedJob, 900_144, submittedJob.evaluator)
    ).toEqual({
      canEvaluatorSettle: !STX_COMMERCE_HAS_AUTONOMOUS_DECISIONS,
      canTimeout: false,
    });
  });

  it("offers permissionless timeout only after the deadline", () => {
    expect(reviewPermissions(submittedJob, 900_145, MAINNET)).toEqual({
      canEvaluatorSettle: false,
      canTimeout: true,
    });
  });

  it("does not expose timeout without a connected wallet or versioned deadline", () => {
    expect(reviewPermissions(submittedJob, 900_145)).toEqual({
      canEvaluatorSettle: false,
      canTimeout: false,
    });
    expect(
      reviewPermissions({ ...submittedJob, reviewDeadline: undefined }, 900_145, MAINNET)
    ).toEqual({ canEvaluatorSettle: false, canTimeout: false });
  });

  it("labels the timeout boundary in Bitcoin blocks", () => {
    expect(reviewDeadlineText(900_144, 900_144)).toMatch(/Evaluator deadline/);
    expect(reviewDeadlineText(900_144, 900_145)).toMatch(/timeout available/);
  });
});
