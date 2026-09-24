/**
 * Relay for the Evaluator's committed admission (`POST /v1/evaluations`).
 *
 * The Evaluator runs as a private service. When the deployment sets `NAYORI_EVALUATOR_ORIGIN`
 * (server-side only, never NEXT_PUBLIC), the app forwards a schema-checked request body unchanged
 * and returns the Evaluator's status. Without it, the app answers 503 and hands the exact body
 * back so an operator can submit it. The Evaluator recomputes every hash against the chain, so the
 * relay adds no trust: it only removes the network hop that participants cannot make themselves.
 */
import {
  type EvaluationRequestBody,
  buildEvaluationRequest,
  parseEvaluableDescription,
} from "./evaluable-jobs";
import { isContractIdForNetwork, isPrincipalForNetwork } from "./evaluation-commitments";

export const RELAY_MAX_BODY_BYTES = 65_536;

export class EvaluationRelayError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

/** Structural check only; the commitment math is re-run below and again by the Evaluator. */
export function parseRelayBody(raw: unknown): EvaluationRequestBody {
  const fail = () => new EvaluationRelayError("The evaluation request is malformed.", 400);
  if (!isRecord(raw) || raw.commitmentVersion !== "1") throw fail();
  const network = raw.network;
  if (network !== "testnet" && network !== "mainnet") throw fail();
  const asset = raw.asset;
  if (asset !== "stx" && asset !== "sbtc") throw fail();
  if (!nonEmpty(raw.contract, 128) || !isContractIdForNetwork(raw.contract, network)) throw fail();
  if (!nonEmpty(raw.jobId, 40) || !/^[1-9][0-9]*$/.test(raw.jobId)) throw fail();
  if (!nonEmpty(raw.evaluationId, 36) || !/^[0-9a-f-]{36}$/.test(raw.evaluationId)) throw fail();
  const job = raw.job;
  if (!isRecord(job) || job.status !== "submitted") throw fail();
  for (const role of ["client", "provider", "evaluator"] as const) {
    if (!nonEmpty(job[role], 64) || !isPrincipalForNetwork(job[role] as string, network)) throw fail();
  }
  if (!nonEmpty(job.reviewDeadlineBurn, 20) || !/^[1-9][0-9]*$/.test(job.reviewDeadlineBurn)) throw fail();
  if (!nonEmpty(job.description, 512)) throw fail();
  if (!Array.isArray(raw.acceptanceCriteria) || raw.acceptanceCriteria.length === 0 || raw.acceptanceCriteria.length > 20) throw fail();
  const acceptanceCriteria = raw.acceptanceCriteria.map((item) => {
    if (!isRecord(item) || !nonEmpty(item.id, 64) || !nonEmpty(item.requirement, 1024) || !nonEmpty(item.verification, 1024)) throw fail();
    return { id: item.id, requirement: item.requirement, verification: item.verification };
  });
  if (!Array.isArray(raw.evidence) || raw.evidence.length === 0 || raw.evidence.length > 50) throw fail();
  const evidence = raw.evidence.map((item) => {
    if (!isRecord(item) || !nonEmpty(item.id, 64) || !nonEmpty(item.uri, 2048) || !nonEmpty(item.sha256, 64) ||
      !nonEmpty(item.mediaType, 128) || !Number.isSafeInteger(item.sizeBytes) || (item.sizeBytes as number) < 0) throw fail();
    return { id: item.id, uri: item.uri, sha256: item.sha256, mediaType: item.mediaType, sizeBytes: item.sizeBytes as number };
  });
  return {
    commitmentVersion: "1",
    evaluationId: raw.evaluationId,
    network,
    asset,
    contract: raw.contract,
    jobId: raw.jobId,
    job: {
      client: job.client as string,
      provider: job.provider as string,
      evaluator: job.evaluator as string,
      status: "submitted",
      reviewDeadlineBurn: job.reviewDeadlineBurn,
      description: job.description,
    },
    acceptanceCriteria,
    evidence,
  };
}

/**
 * Recomputes the request from its own on-chain description and refuses anything the Evaluator
 * would refuse, before spending an upstream request on it.
 */
export async function assertSelfConsistent(body: EvaluationRequestBody): Promise<void> {
  if (!parseEvaluableDescription(body.job.description)) {
    throw new EvaluationRelayError("The job description does not carry readable acceptance criteria.", 400);
  }
  const rebuilt = await buildEvaluationRequest({
    context: { network: body.network, asset: body.asset, contract: body.contract, client: body.job.client, evaluator: body.job.evaluator },
    jobId: Number(body.jobId),
    provider: body.job.provider,
    description: body.job.description,
    reviewDeadlineBurn: Number(body.job.reviewDeadlineBurn),
    evidence: body.evidence,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(body)) {
    throw new EvaluationRelayError("The evaluation request does not match its on-chain commitments.", 400);
  }
}

export interface RelayResult {
  status: number;
  body: unknown;
  relayed: boolean;
}

export async function relayEvaluation(
  body: EvaluationRequestBody,
  options: { origin?: string; transport?: typeof fetch; signal?: AbortSignal } = {},
): Promise<RelayResult> {
  const origin = (options.origin ?? process.env.NAYORI_EVALUATOR_ORIGIN ?? "").trim();
  if (!origin) {
    return {
      status: 503,
      relayed: false,
      body: {
        error: "evaluator_relay_unavailable",
        message: "The Evaluator admission relay is not configured on this deployment. Send this exact request body to the operator.",
        request: body,
      },
    };
  }
  let url: URL;
  try {
    url = new URL("/v1/evaluations", origin);
  } catch {
    throw new EvaluationRelayError("Evaluator origin is misconfigured.", 500);
  }
  const transport = options.transport ?? fetch;
  let response: Response;
  try {
    response = await transport(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: options.signal,
    });
  } catch {
    throw new EvaluationRelayError("The Evaluator did not answer.", 502);
  }
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 512) };
  }
  return { status: response.status, body: parsed, relayed: true };
}
