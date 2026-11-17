// Plain-English messages for the error codes of the next Nayori contracts. The ranges do not
// overlap between contracts (roles 1xx, reputation 2xx, escrows 3xx, permissions 4xx,
// agents 5xx, applications 6xx), so a code alone names the failure.

export const NEXT_CONTRACT_ERRORS: Record<number, string> = {
  100: "That role does not exist.",
  101: "Only the current role holder can do this.",
  102: "That wallet already holds this or the other role.",
  103: "No handover is waiting for this role.",
  104: "Only the proposed wallet can accept the handover.",
  105: "The handover waiting period has not passed yet.",
  200: "Only a Nayori escrow can record reputation.",
  201: "This job outcome is already recorded.",
  202: "No outcome is recorded for this job yet.",
  203: "Only the client of a completed job can rate it.",
  204: "This job is already rated.",
  205: "The rating must be between 1 and 5.",
  300: "Job not found.",
  301: "This step is not available for the job right now.",
  302: "Only the client of this job can do this.",
  303: "Only the provider named on this job can do this.",
  304: "Only the evaluator of this job can record the decision.",
  305: "Only the side that lost the decision can appeal.",
  306: "Only the appeal authority of this job can resolve the appeal.",
  307: "Client, evaluator, provider, treasury and appeal authority must be different wallets.",
  308: "The budget is outside the allowed range.",
  309: "The delivery or review window is outside the allowed range.",
  310: "Enter a job description.",
  311: "The decision must be approve or reject.",
  312: "The evidence hash must be a non-zero 32-byte digest.",
  313: "The job deadline has passed.",
  314: "This step opens later. Wait for the Bitcoin block shown on the job.",
  315: "The window for this step has closed.",
  316: "There is no pending reputation update for this job.",
  400: "Allowances must be set by your wallet directly.",
  500: "This wallet cannot act for that agent.",
  501: "This wallet already has an agent.",
  502: "This wallet has no agent yet.",
  503: "Enter an agent name.",
  600: "This wallet cannot act for that applicant.",
  601: "Only registered agents can apply. Register this wallet as an agent first.",
  602: "Job not found in the sBTC escrow.",
  603: "This job no longer takes applications.",
  604: "This job still takes applications, so deposits cannot be released yet.",
  605: "The deposit must be between 100 and 1,000,000 sats.",
  606: "This agent already applied to the job.",
  607: "The list is full. Deposit more than the lowest application to join it.",
  608: "There is no application from this wallet on the job.",
  609: "Only the client of this job can decline applications.",
  610: "The client cannot apply to its own job.",
  611: "The client declined this agent for the job.",
  612: "The evaluator, treasury and appeal authority cannot apply.",
};

export function humanizeNextError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  const code = raw.match(/\(err u(\d{3})\)|\bu(\d{3})\b/);
  const value = code ? Number(code[1] ?? code[2]) : NaN;
  if (NEXT_CONTRACT_ERRORS[value]) return NEXT_CONTRACT_ERRORS[value];
  if (/cancel|reject|denied/i.test(raw)) return "The wallet request was cancelled.";
  // Local validation messages are already written for people; pass them through.
  if (error instanceof Error && /^(The|Enter|Add|Job id|Budget|Deposit|Rating|Evaluator|Provider|Client|Applicant|Evidence|Resolution|Delivery|Review)\b/.test(raw)) {
    return raw;
  }
  return "The transaction could not be submitted. Check the job state and wallet network.";
}
