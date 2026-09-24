/**
 * Evaluable jobs from the web app.
 *
 * The Evaluator only decides jobs whose on-chain description ends with a criteria commitment and
 * whose deliverable is the 36-byte evidence commitment. The app keeps every input needed to
 * recompute both commitments ON-CHAIN: the plain description carries the acceptance criteria as
 * numbered lines, so any party (client, provider, Evaluator, auditor) rebuilds the exact
 * `acceptanceCriteria` manifest from the job alone. Nothing is stored off-chain by the app.
 */
import {
  type CommitmentNetwork,
  type EvaluationCriterion,
  type EvaluationEvidence,
  evaluationJobId,
  parseEvaluationDescription,
  prepareEvaluationJob,
  prepareEvaluationSubmission,
} from "./evaluation-commitments";

export const CRITERIA_HEADER = "Acceptance criteria:";
export const MAX_CRITERIA = 20;
/** Plain description budget: 512 minus the 84-character marker + hash suffix. */
export const MAX_PLAIN_DESCRIPTION = 512 - "\nnayori-criteria-v1:".length - 64;

export interface EvaluableJobContext {
  network: CommitmentNetwork;
  asset: "stx" | "sbtc";
  contract: string;
  client: string;
  evaluator: string;
}

export interface ParsedEvaluableDescription {
  task: string;
  criteria: string[];
  criteriaHash: string;
  plainDescription: string;
}

/** One criterion per non-empty line. Leading list markers ("1.", "-", "*") are stripped. */
export function criteriaLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d{1,2}[.)])\s*/, "").trim())
    .filter((line) => line.length > 0);
}

/** Deterministic manifest: c1..cN, requirement = line, verification derived from the line. */
export function toAcceptanceCriteria(lines: readonly string[]): EvaluationCriterion[] {
  return lines.map((line, index) => ({
    id: `c${index + 1}`,
    requirement: line,
    verification: `Confirm from the evidence that: ${line}`,
  }));
}

export function composePlainDescription(task: string, lines: readonly string[]): string {
  const cleanTask = task.replace(/\r\n/g, "\n").trim();
  return `${cleanTask}\n${CRITERIA_HEADER}\n${lines.map((line, index) => `${index + 1}. ${line}`).join("\n")}`;
}

function splitPlainDescription(plain: string): { task: string; criteria: string[] } | null {
  const marker = `\n${CRITERIA_HEADER}\n`;
  const index = plain.lastIndexOf(marker);
  if (index <= 0) return null;
  const task = plain.slice(0, index);
  const criteria = criteriaLines(plain.slice(index + marker.length));
  if (!task.trim() || criteria.length === 0 || criteria.length > MAX_CRITERIA) return null;
  return { task, criteria };
}

/** Validates the client's inputs and returns the on-chain description with the commitment. */
export async function buildEvaluableDescription(
  context: EvaluableJobContext,
  task: string,
  criteriaText: string,
): Promise<{ description: string; criteriaHash: string; plainDescription: string }> {
  const lines = criteriaLines(criteriaText);
  if (lines.length === 0) throw new Error("Add at least one acceptance criterion (one per line).");
  if (lines.length > MAX_CRITERIA) throw new Error(`Use at most ${MAX_CRITERIA} acceptance criteria.`);
  if (!task.trim()) throw new Error("Describe the task before adding acceptance criteria.");
  const plainDescription = composePlainDescription(task, lines);
  if (plainDescription.length > MAX_PLAIN_DESCRIPTION) {
    throw new Error(
      `Task and criteria use ${plainDescription.length} characters; the on-chain limit is ${MAX_PLAIN_DESCRIPTION}.`,
    );
  }
  if (!/^[\x20-\x7e\n]+$/.test(plainDescription)) {
    throw new Error("Use plain ASCII text in the task and acceptance criteria.");
  }
  const parsed = splitPlainDescription(plainDescription);
  if (!parsed || parsed.criteria.join("\n") !== lines.join("\n")) {
    throw new Error("Acceptance criteria lines must not start with list markers or be empty.");
  }
  const prepared = await prepareEvaluationJob({
    ...context,
    description: plainDescription,
    acceptanceCriteria: toAcceptanceCriteria(lines),
  });
  return { ...prepared, plainDescription };
}

/** Reads a job description back. Returns null when the job is not an app-evaluable job. */
export function parseEvaluableDescription(description: string): ParsedEvaluableDescription | null {
  let parsed: { description: string; criteriaHash: string };
  try {
    parsed = parseEvaluationDescription(description);
  } catch {
    return null;
  }
  const split = splitPlainDescription(parsed.description);
  if (!split) return null;
  return { ...split, criteriaHash: parsed.criteriaHash, plainDescription: parsed.description };
}

/** True when the description carries any criteria commitment (app or SDK/MCP created). */
export function hasCriteriaCommitment(description: string): boolean {
  try {
    parseEvaluationDescription(description);
    return true;
  } catch {
    return false;
  }
}

export interface CommittedSubmissionInput extends EvaluableJobContext {
  jobId: number;
  provider: string;
  description: string;
  evidence: EvaluationEvidence[];
}

export interface CommittedSubmission {
  deliverable: Uint8Array;
  deliverableHex: string;
  evidenceHash: string;
  criteriaHash: string;
  acceptanceCriteria: EvaluationCriterion[];
  plainDescription: string;
}

/**
 * Rebuilds the criteria from the on-chain description, proves they hash to the committed value
 * and returns the 36-byte deliverable for submit-work. Refuses jobs whose criteria cannot be
 * reconstructed from chain data (those must be submitted with the exact off-chain manifest).
 */
export async function buildCommittedSubmission(input: CommittedSubmissionInput): Promise<CommittedSubmission> {
  const parsed = parseEvaluableDescription(input.description);
  if (!parsed) {
    throw new Error(
      "This job's acceptance criteria are not readable from the chain. Submit with the SDK or MCP using the client's exact manifest.",
    );
  }
  const acceptanceCriteria = toAcceptanceCriteria(parsed.criteria);
  const prepared = await prepareEvaluationSubmission({
    network: input.network,
    asset: input.asset,
    contract: input.contract,
    client: input.client,
    evaluator: input.evaluator,
    provider: input.provider,
    jobId: String(input.jobId),
    description: parsed.plainDescription,
    acceptanceCriteria,
    evidence: input.evidence,
  });
  if (prepared.criteriaHash !== parsed.criteriaHash) {
    throw new Error("The rebuilt acceptance criteria do not match the on-chain commitment.");
  }
  return {
    deliverable: prepared.deliverable,
    deliverableHex: Array.from(prepared.deliverable, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    evidenceHash: prepared.evidenceHash,
    criteriaHash: prepared.criteriaHash,
    acceptanceCriteria,
    plainDescription: parsed.plainDescription,
  };
}

/** Exact body accepted by the Evaluator's `POST /v1/evaluations` (committed admission). */
export interface EvaluationRequestBody {
  commitmentVersion: "1";
  evaluationId: string;
  network: CommitmentNetwork;
  asset: "stx" | "sbtc";
  contract: string;
  jobId: string;
  job: {
    client: string;
    provider: string;
    evaluator: string;
    status: "submitted";
    reviewDeadlineBurn: string;
    description: string;
  };
  acceptanceCriteria: EvaluationCriterion[];
  evidence: EvaluationEvidence[];
}

export async function buildEvaluationRequest(input: {
  context: EvaluableJobContext;
  jobId: number;
  provider: string;
  description: string;
  reviewDeadlineBurn: number;
  evidence: EvaluationEvidence[];
}): Promise<EvaluationRequestBody> {
  const parsed = parseEvaluableDescription(input.description);
  if (!parsed) throw new Error("This job's acceptance criteria are not readable from the chain.");
  if (!Number.isSafeInteger(input.reviewDeadlineBurn) || input.reviewDeadlineBurn <= 0) {
    throw new Error("The job has no Bitcoin review deadline yet. Wait for the submission to confirm.");
  }
  const jobId = String(input.jobId);
  return {
    commitmentVersion: "1",
    evaluationId: await evaluationJobId({ network: input.context.network, contract: input.context.contract, jobId }),
    network: input.context.network,
    asset: input.context.asset,
    contract: input.context.contract,
    jobId,
    job: {
      client: input.context.client,
      provider: input.provider,
      evaluator: input.context.evaluator,
      status: "submitted",
      reviewDeadlineBurn: String(input.reviewDeadlineBurn),
      description: input.description,
    },
    acceptanceCriteria: toAcceptanceCriteria(parsed.criteria),
    evidence: input.evidence,
  };
}

/** The on-chain deliverable of an app/SDK committed submission, if it carries the ny1 prefix. */
export function committedEvidenceHash(deliverableHex?: string): string | null {
  if (!deliverableHex) return null;
  const hex = deliverableHex.replace(/^0x/, "").toLowerCase();
  // "ny1:" = 6e 79 31 3a followed by 32 bytes; the contract may pad to 64 bytes.
  if (!/^6e79313a[0-9a-f]{64}/.test(hex)) return null;
  return hex.slice(8, 72);
}
