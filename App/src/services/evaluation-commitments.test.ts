import { describe, expect, it } from "vitest";

import {
  evaluationJobId,
  parseEvaluationDescription,
  prepareEvaluationJob,
  prepareEvaluationSubmission,
} from "./evaluation-commitments";

// Shared cross-repository fixtures: identical inputs and hashes live in
// @perkos/agent-sdk tests/evaluation-commitments.test.ts and in the Evaluator.
const testnetInput = {
  network: "testnet" as const,
  asset: "sbtc" as const,
  contract: "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.sbtc-commerce-v5",
  client: "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5",
  evaluator: "STBTXHXFXFGMNPXST7A6XQ1WNGC0V6TB6CDDQZB4",
  provider: "ST3QBWTA0XSA94YDXT13QFH3ZMSZSM1V4Z645YHT9",
  description: "Return the verified count",
  jobId: "7",
  acceptanceCriteria: [{ id: "count", requirement: "Count is 3", verification: "Parse JSON and compare count" }],
  evidence: [{ id: "result", uri: "https://example.com/result.json", sha256: "11".repeat(32), mediaType: "application/json", sizeBytes: 11 }],
};
const mainnetInput = {
  ...testnetInput,
  network: "mainnet" as const,
  contract: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce-v5",
  client: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH",
  evaluator: "SP3GRG5CKEFNYM5BV0NPPHCM51FT176JQ02QWQ9T3",
  provider: "SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8",
};

describe("evaluation commitments (byte-identical with the SDK and the Evaluator)", () => {
  it("matches the testnet cross-repository fixture", async () => {
    const result = await prepareEvaluationSubmission(testnetInput);
    expect(result.criteriaHash).toBe("0c76162899c8a456c0f3031703124f84a44e229acd38b0854d39c9eca02f44da");
    expect(result.evidenceHash).toBe("877a7ae17c19e3fecdbf95e3b044650e35d0ae2220bbecff0783648476290c33");
    expect(parseEvaluationDescription(result.description)).toEqual({
      description: testnetInput.description,
      criteriaHash: result.criteriaHash,
    });
  });

  it("matches the mainnet cross-repository fixture", async () => {
    const result = await prepareEvaluationSubmission(mainnetInput);
    expect(result.criteriaHash).toBe("cda522ab7de4f1f9f392021baf6b2d1f349a7ee2ebcd5f26b5d5c3068113b413");
    expect(result.evidenceHash).toBe("6f85484d03505343f8bd6827781fb9cd3dbfb70f978c1e14d3931ee94c898b51");
    expect(await evaluationJobId({ network: "mainnet", contract: mainnetInput.contract, jobId: "7" }))
      .toBe("55e44561-9516-59df-ae28-4134a0d61b52");
  });

  it("reproduces the mainnet job 2 criteria hash committed on-chain on 2026-09-18", async () => {
    const job2 = await prepareEvaluationJob({
      network: "mainnet",
      asset: "sbtc",
      contract: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce-v5",
      client: "SP10Y6Z8SVWPDFBYCJC23R9J8DGSJZFQJRWZRMAZR",
      evaluator: "SP3GRG5CKEFNYM5BV0NPPHCM51FT176JQ02QWQ9T3",
      description: "Write a short brief explaining how sBTC escrow protects both sides of an agent job on Stacks.",
      acceptanceCriteria: [
        { id: "length", requirement: "The brief body is between 120 and 180 words, excluding the title line.", verification: "Count the words of the evidence text after the first line." },
        { id: "both-sides", requirement: "The brief explains how the escrow protects the client and how it protects the provider.", verification: "Both the client protection and the provider protection are explicitly described in the evidence text." },
        { id: "mechanics", requirement: "The brief states that the budget is locked in escrow before work begins and is released only after an evaluation or a deadline.", verification: "The evidence text mentions locking the funds up front and release after evaluation or timeout." },
      ],
    });
    expect(job2.criteriaHash).toBe("37454208f7fc9db294573269690950828ea8f10441f03e7d308ff90bc7efdd65");
    expect(await evaluationJobId({ network: "mainnet", contract: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce-v5", jobId: "2" }))
      .toBe("da3d80a0-26ac-59a4-a79c-2677173198fe");
  });

  it("produces a 36-byte deliverable with the ny1 prefix", async () => {
    const result = await prepareEvaluationSubmission(mainnetInput);
    expect(result.deliverable.length).toBe(36);
    expect(new TextDecoder().decode(result.deliverable.slice(0, 4))).toBe("ny1:");
    expect(Buffer.from(result.deliverable.slice(4)).toString("hex")).toBe(result.evidenceHash);
    expect(result.description.length).toBeLessThanOrEqual(512);
  });

  it("rejects crossed address families, spoofed markers and unsafe evidence URIs", async () => {
    await expect(prepareEvaluationJob({ ...mainnetInput, client: testnetInput.client })).rejects.toThrow();
    await expect(prepareEvaluationJob({ ...testnetInput, description: "Spoof nayori-criteria-v1:" })).rejects.toThrow();
    await expect(prepareEvaluationSubmission({ ...testnetInput, evidence: [{ ...testnetInput.evidence[0]!, uri: "http://example.com/a" }] })).rejects.toThrow();
    expect(() => parseEvaluationDescription("no marker here")).toThrow();
  });
});
