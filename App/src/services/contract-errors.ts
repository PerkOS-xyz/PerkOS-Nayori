const CONTRACT_ERRORS: Record<string, string> = {
  u202: "Job not found.",
  u203: "This action is not valid for the current job state.",
  u204: "The job has expired.",
  u205: "Enter a valid budget.",
  u207: "Only the client can perform this action.",
  u208: "Only the assigned provider can submit work.",
  u209: "Only the evaluator can settle or reject this job.",
  u210: "This job is already funded.",
  u212: "Enter a job description.",
  u213: "Client, provider and evaluator must be different wallets.",
  u214: "This wallet has already rated this job.",
  u215: "Rating must be between 1 and 5.",
  u216: "This job has not expired yet.",
  u302: "Job not found.",
  u303: "This action is not valid for the current job state.",
  u304: "The job has expired.",
  u305: "Enter a valid budget.",
  u307: "Only the client can perform this action.",
  u308: "Only the assigned provider can submit work.",
  u309: "Only the independent evaluator can perform this action.",
  u310: "This job is already funded.",
  u311: "The configured payment token is not canonical sBTC.",
  u312: "Enter a job description.",
  u313: "Client, provider and evaluator must be different wallets.",
  u314: "This wallet has already rated this job.",
  u315: "Rating must be between 1 and 5.",
  u316: "This job has not expired yet.",
};

export function humanizeContractError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  const code = raw.match(/\bu\d{3}\b/)?.[0];
  if (code && CONTRACT_ERRORS[code]) return CONTRACT_ERRORS[code];
  if (/cancel|reject/i.test(raw)) return "The wallet request was cancelled.";
  if (/address|principal/i.test(raw)) return "Enter a valid Stacks address for this network.";
  return "The transaction could not be submitted. Check the job state and wallet network.";
}
