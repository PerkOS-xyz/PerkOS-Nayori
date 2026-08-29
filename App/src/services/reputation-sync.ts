import { cvToValue } from "@stacks/transactions";

export interface ReputationSyncState {
  pending: boolean;
  lastError: number;
  outcome: number;
}

export function parseReputationSync(cv: any): ReputationSyncState | null {
  if (cv?.type !== "ok") return null;
  const state: any = cvToValue(cv).value;
  return {
    pending: (state.pending?.value ?? state.pending) === true,
    lastError: Number(state["last-error"]?.value ?? state["last-error"] ?? 0),
    outcome: Number(state.outcome?.value ?? state.outcome ?? 0),
  };
}
