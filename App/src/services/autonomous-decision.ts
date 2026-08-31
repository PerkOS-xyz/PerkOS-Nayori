import { cvToValue, type ClarityValue } from "@stacks/transactions";

export interface AutonomousDecisionState {
  originalDecision: 1 | 2;
  finalDecision?: 1 | 2;
  evidenceHash: string;
  explanationHash: string;
  decidedAtBurn: number;
  appealDeadline: number;
  appealedBy?: string;
  appealEvidenceHash?: string;
  resolutionDeadline?: number;
  resolutionHash?: string;
  finalizedBy?: string;
  finalizedAtBurn?: number;
}

const optionalValue = (value: any) =>
  value?.value === null || value?.value === undefined ? undefined : value.value.value;
const normalizedHash = (value: unknown) =>
  typeof value === "string" ? value.replace(/^0x/, "").toLowerCase() : "";

export function parseAutonomousDecision(cv: ClarityValue): AutonomousDecisionState | null {
  if (cv.type !== "ok") return null;
  const tuple: any = cvToValue(cv).value;
  const originalDecision = Number(tuple["original-decision"]?.value);
  if (originalDecision !== 1 && originalDecision !== 2) return null;
  const final = optionalValue(tuple["final-decision"]);
  return {
    originalDecision,
    ...(final === 1 || final === 2 ? { finalDecision: final } : {}),
    evidenceHash: normalizedHash(tuple["evidence-hash"]?.value),
    explanationHash: normalizedHash(tuple["explanation-hash"]?.value),
    decidedAtBurn: Number(tuple["decided-at-burn"]?.value ?? 0),
    appealDeadline: Number(tuple["appeal-deadline"]?.value ?? 0),
    ...(optionalValue(tuple["appealed-by"])
      ? { appealedBy: optionalValue(tuple["appealed-by"]) }
      : {}),
    ...(optionalValue(tuple["appeal-evidence-hash"])
      ? { appealEvidenceHash: normalizedHash(optionalValue(tuple["appeal-evidence-hash"])) }
      : {}),
    ...(optionalValue(tuple["resolution-deadline"]) !== undefined
      ? { resolutionDeadline: Number(optionalValue(tuple["resolution-deadline"])) }
      : {}),
    ...(optionalValue(tuple["resolution-hash"])
      ? { resolutionHash: normalizedHash(optionalValue(tuple["resolution-hash"])) }
      : {}),
    ...(optionalValue(tuple["finalized-by"])
      ? { finalizedBy: optionalValue(tuple["finalized-by"]) }
      : {}),
    ...(optionalValue(tuple["finalized-at-burn"]) !== undefined
      ? { finalizedAtBurn: Number(optionalValue(tuple["finalized-at-burn"])) }
      : {}),
  };
}

export const decisionLabel = (decision: 1 | 2) =>
  decision === 1 ? "Approve" : "Reject";
