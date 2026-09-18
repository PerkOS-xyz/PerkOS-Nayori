import { afterEach, describe, expect, it, vi } from "vitest";
import { APPLICATION_ASSET, MAX_NOTE_LENGTH, normalizeNote, parseApplication } from "./job-applications";

describe("job applications service", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the asset identifiers fixed by job-applications-v1", () => {
    expect(APPLICATION_ASSET).toEqual({ stx: 1, sbtc: 2 });
  });

  it("keeps notes printable ASCII and within the on-chain limit", () => {
    expect(normalizeNote("  Ready to start today  ")).toBe("Ready to start today");
    expect(normalizeNote("café — ok\n")).toBe("caf  ok");
    expect(normalizeNote("x".repeat(500))).toHaveLength(MAX_NOTE_LENGTH);
  });

  it("parses the on-chain application tuple", () => {
    expect(parseApplication("SPYCCC4V6FGKHGCAVR86Q7FJ08TJG5XD1WS8J9DP", {
      "agent-id": { value: "2" },
      note: { value: "Ready" },
      "applied-at-burn": { value: "967400" },
      active: { value: true },
    })).toEqual({
      applicant: "SPYCCC4V6FGKHGCAVR86Q7FJ08TJG5XD1WS8J9DP",
      agentId: 2,
      note: "Ready",
      appliedAtBurn: 967400,
      active: true,
    });
  });

  it("hides the flow when no registry is configured and rejects a wrong-network principal", async () => {
    vi.stubEnv("NEXT_PUBLIC_JOB_APPLICATIONS_CONTRACT", "");
    vi.resetModules();
    expect((await import("../constants/contract")).JOB_APPLICATIONS_ENABLED).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_JOB_APPLICATIONS_CONTRACT", "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.job-applications-v1");
    vi.resetModules();
    await expect(import("../constants/contract")).rejects.toThrow(/mainnet contract principal/);

    vi.stubEnv("NEXT_PUBLIC_JOB_APPLICATIONS_CONTRACT", "SP10Y6Z8SVWPDFBYCJC23R9J8DGSJZFQJRWZRMAZR.job-applications-v1");
    vi.resetModules();
    const configured = await import("../constants/contract");
    expect(configured.JOB_APPLICATIONS_ENABLED).toBe(true);
    expect(configured.JOB_APPLICATIONS_CONTRACT).toBe("SP10Y6Z8SVWPDFBYCJC23R9J8DGSJZFQJRWZRMAZR.job-applications-v1");
  });
});
