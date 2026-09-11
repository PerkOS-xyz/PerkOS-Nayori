import { beforeEach, describe, expect, it, vi } from "vitest";
import { Cl } from "@stacks/transactions";
import { parseAutonomousDecision } from "./autonomous-decision";

const mocks = vi.hoisted(() => ({ job: vi.fn(), decision: vi.fn(), sync: vi.fn() }));
vi.mock("./agentic-commerce", async original => ({
  ...await original<typeof import("./agentic-commerce")>(),
  getJob: mocks.job, getDecision: mocks.decision, getReputationSync: mocks.sync,
}));
vi.mock("./sbtc-commerce", async original => ({
  ...await original<typeof import("./sbtc-commerce")>(),
  getSbtcJob: mocks.job, getSbtcDecision: mocks.decision, getSbtcReputationSync: mocks.sync,
}));
vi.mock("./service-fees", async original => ({
  ...await original<typeof import("./service-fees")>(), hasServiceFees: () => false,
}));
import { getCommerceJob, reviewDeadlineText } from "./commerce";

beforeEach(() => { vi.clearAllMocks(); mocks.sync.mockResolvedValue(null); });
describe.each(["sbtc", "stx"] as const)("%s decision history", currency => {
  it.each([3, 4, 7, 8])("loads real decision data for status %i", async status => {
    mocks.job.mockResolvedValue({ id: 15, status, reviewDeadline: 100 });
    const decision = parseAutonomousDecision(Cl.ok(Cl.tuple({
      "original-decision": Cl.uint(1),
      "final-decision": status === 3 || status === 4 ? Cl.some(Cl.uint(status === 3 ? 1 : 2)) : Cl.none(),
      "evidence-hash": Cl.bufferFromHex("11".repeat(32)),
      "explanation-hash": Cl.bufferFromHex("22".repeat(32)),
    })));
    mocks.decision.mockResolvedValue(decision);
    const job = await getCommerceJob(15, currency);
    expect(mocks.decision).toHaveBeenCalledWith(15);
    expect(job?.decision?.originalDecision).toBe(1);
    expect(job?.decision?.finalDecision).toBe(status === 3 ? 1 : status === 4 ? 2 : undefined);
  });
  it.each([2, 5, 6])("does not fabricate a decision for status %i", async status => {
    mocks.job.mockResolvedValue({ id: 15, status });
    expect((await getCommerceJob(15, currency))?.decision).toBeUndefined();
    expect(mocks.decision).not.toHaveBeenCalled();
  });
  it("does not infer approval when a completed job has no readable decision", async () => {
    mocks.job.mockResolvedValue({ id: 15, status: 3 });
    mocks.decision.mockResolvedValue(null);
    expect((await getCommerceJob(15, currency))?.decision).toBeUndefined();
  });
});

describe("review status disclosure", () => {
  it.each([3, 4, 5, 6, 7, 8])("never advertises a review timeout outside submitted: %i", status => {
    expect(reviewDeadlineText(100, 200, status)).toBe("Review closed · Bitcoin block #100");
  });
  it("preserves the strict submitted deadline", () => {
    expect(reviewDeadlineText(100, 100, 2)).not.toContain("timeout available");
    expect(reviewDeadlineText(100, 101, 2)).toContain("timeout available");
  });
});
