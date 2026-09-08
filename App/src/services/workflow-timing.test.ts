import { describe, it, expect } from "vitest";
import { Cl } from "@stacks/transactions";
import { deadlineProgress, operatorTimingPolicy, parseTimingWindow } from "./workflow-timing";
describe("public workflow timing", () => {
  it("preserves mainnet minimum and permits explicit fast testnet baseline", () => {
    expect(operatorTimingPolicy("mainnet")).toEqual({ workflowBurnBlocks: 6, settlementBurnBlocks: 6 });
    expect(operatorTimingPolicy("testnet", "0", "6").workflowBurnBlocks).toBe(0);
    expect(() => operatorTimingPolicy("mainnet", "0", "6")).toThrow();
    expect(() => operatorTimingPolicy("testnet", "6", "0")).toThrow();
  });
  it.each(["", "-1", "1.5", "NaN", "145", " 6", "06"])("rejects malformed configuration %s", v => {
    expect(() => operatorTimingPolicy("testnet", v, "6")).toThrow();
  });
  it("reads live uint windows and refuses unavailable data", () => {
    expect(parseTimingWindow(Cl.ok(Cl.uint(12)))).toBe(12);
    for (const cv of [Cl.error(Cl.uint(1)), Cl.ok(Cl.uint(0)), Cl.ok(Cl.stringAscii("12")), Cl.ok(Cl.uint("9007199254740992"))]) expect(() => parseTimingWindow(cv)).toThrow();
  });
  it("handles exact deadline, strict greater-than, missing data and estimates", () => {
    expect(deadlineProgress(100, 99)).toMatchObject({ remainingBurnBlocks: 2, deadlinePassed: false });
    expect(deadlineProgress(100, 100)).toMatchObject({ remainingBurnBlocks: 1, deadlinePassed: false, estimatedSeconds: 600, estimateIsGuarantee: false });
    expect(deadlineProgress(100, 101)).toMatchObject({ remainingBurnBlocks: 0, deadlinePassed: true });
    expect(deadlineProgress(100, 0)).toBeNull(); expect(deadlineProgress(undefined, 100)).toBeNull();
  });
});
