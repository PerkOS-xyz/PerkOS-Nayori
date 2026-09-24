import { describe, expect, it } from "vitest";

import {
  MAX_PLAIN_DESCRIPTION,
  buildCommittedSubmission,
  buildEvaluableDescription,
  buildEvaluationRequest,
  committedEvidenceHash,
  criteriaLines,
  hasCriteriaCommitment,
  parseEvaluableDescription,
} from "./evaluable-jobs";
import { parseEvaluationDescription, prepareEvaluationJob } from "./evaluation-commitments";

const context = {
  network: "mainnet" as const,
  asset: "sbtc" as const,
  contract: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce-v5",
  client: "SP10Y6Z8SVWPDFBYCJC23R9J8DGSJZFQJRWZRMAZR",
  evaluator: "SP3GRG5CKEFNYM5BV0NPPHCM51FT176JQ02QWQ9T3",
};
const provider = "SPYCCC4V6FGKHGCAVR86Q7FJ08TJG5XD1WS8J9DP";
const evidence = [{ id: "deliverable", uri: "https://nayori.ai/job-evidence/x.txt", sha256: "ab".repeat(32), mediaType: "text/plain", sizeBytes: 120 }];

describe("evaluable jobs from the web app", () => {
  it("strips list markers and empty lines from criteria", () => {
    expect(criteriaLines("1. First\n\n- Second\n* Third \n 4) Fourth")).toEqual(["First", "Second", "Third", "Fourth"]);
  });

  it("composes an on-chain description whose criteria round-trip and hash to the commitment", async () => {
    const built = await buildEvaluableDescription(context, "Write a haiku about escrow.", "Exactly three lines\nMentions Bitcoin");
    expect(built.description.length).toBeLessThanOrEqual(512);
    expect(parseEvaluationDescription(built.description).criteriaHash).toBe(built.criteriaHash);
    const parsed = parseEvaluableDescription(built.description);
    expect(parsed).toMatchObject({ task: "Write a haiku about escrow.", criteria: ["Exactly three lines", "Mentions Bitcoin"], criteriaHash: built.criteriaHash });
    const recomputed = await prepareEvaluationJob({
      ...context,
      description: built.plainDescription,
      acceptanceCriteria: [
        { id: "c1", requirement: "Exactly three lines", verification: "Confirm from the evidence that: Exactly three lines" },
        { id: "c2", requirement: "Mentions Bitcoin", verification: "Confirm from the evidence that: Mentions Bitcoin" },
      ],
    });
    expect(recomputed.criteriaHash).toBe(built.criteriaHash);
    expect(hasCriteriaCommitment(built.description)).toBe(true);
    expect(hasCriteriaCommitment("plain job")).toBe(false);
  });

  it("rejects empty, oversized and non-ASCII inputs with actionable messages", async () => {
    await expect(buildEvaluableDescription(context, "Task", "")).rejects.toThrow(/at least one/);
    await expect(buildEvaluableDescription(context, "", "one")).rejects.toThrow(/Describe the task/);
    await expect(buildEvaluableDescription(context, "x".repeat(MAX_PLAIN_DESCRIPTION), "one")).rejects.toThrow(/limit is/);
    await expect(buildEvaluableDescription(context, "Tarea con acentos: evaluación", "one")).rejects.toThrow(/ASCII/);
  });

  it("returns null for SDK-created jobs whose criteria live off-chain", async () => {
    const sdkJob = await prepareEvaluationJob({ ...context, description: "Off-chain criteria", acceptanceCriteria: [{ id: "a", requirement: "r", verification: "v" }] });
    expect(parseEvaluableDescription(sdkJob.description)).toBeNull();
    expect(hasCriteriaCommitment(sdkJob.description)).toBe(true);
    await expect(buildCommittedSubmission({ ...context, jobId: 3, provider, description: sdkJob.description, evidence })).rejects.toThrow(/SDK or MCP/);
  });

  it("builds the 36-byte deliverable and the exact Evaluator request from chain data only", async () => {
    const built = await buildEvaluableDescription(context, "Summarize the escrow flow.", "Under 150 words\nNames both parties");
    const submission = await buildCommittedSubmission({ ...context, jobId: 9, provider, description: built.description, evidence });
    expect(submission.deliverable.length).toBe(36);
    expect(submission.deliverableHex.startsWith("6e79313a")).toBe(true);
    expect(committedEvidenceHash(submission.deliverableHex)).toBe(submission.evidenceHash);
    expect(committedEvidenceHash(`0x${submission.deliverableHex}${"00".repeat(28)}`)).toBe(submission.evidenceHash);
    expect(committedEvidenceHash("abcd")).toBeNull();

    const request = await buildEvaluationRequest({ context, jobId: 9, provider, description: built.description, reviewDeadinelineBurn: 0 } as never).catch((error: Error) => error);
    expect(request).toBeInstanceOf(Error);
    const body = await buildEvaluationRequest({ context, jobId: 9, provider, description: built.description, reviewDeadlineBurn: 967655, evidence });
    expect(body).toMatchObject({
      commitmentVersion: "1",
      network: "mainnet",
      asset: "sbtc",
      contract: context.contract,
      jobId: "9",
      job: { client: context.client, provider, evaluator: context.evaluator, status: "submitted", reviewDeadlineBurn: "967655", description: built.description },
      acceptanceCriteria: submission.acceptanceCriteria,
      evidence,
    });
    expect(body.evaluationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
