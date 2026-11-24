// Plain-language names for the public functions of the Nayori contracts, for the activity views.
// `category` matches the filters of the activity log.

export type ActivityCategory = "agents" | "jobs" | "funded" | "completed" | "rejected" | "timeout";

export const NAYORI_FUNCTION_LABELS: Record<string, { label: string; category: ActivityCategory }> = {
  register: { label: "Agent registered", category: "agents" },
  update: { label: "Agent updated", category: "agents" },
  "create-job": { label: "Job created", category: "jobs" },
  "fund-job": { label: "Job funded", category: "funded" },
  "name-provider": { label: "Provider named", category: "jobs" },
  "accept-job": { label: "Job accepted", category: "jobs" },
  "submit-work": { label: "Work submitted", category: "jobs" },
  "record-decision": { label: "Decision recorded", category: "jobs" },
  "record-default-approval": { label: "Approved after the review window", category: "jobs" },
  appeal: { label: "Decision appealed", category: "jobs" },
  "resolve-appeal": { label: "Appeal resolved", category: "jobs" },
  "settle-job": { label: "Job settled", category: "completed" },
  "refund-no-delivery": { label: "Budget returned to the client", category: "timeout" },
  "close-unfunded": { label: "Unfunded job closed", category: "timeout" },
  "rate-provider": { label: "Provider rated", category: "agents" },
  "retry-reputation": { label: "Reputation update retried", category: "jobs" },
  "apply-to-job": { label: "Applied to a job", category: "jobs" },
  withdraw: { label: "Application withdrawn", category: "jobs" },
  decline: { label: "Application declined", category: "jobs" },
  release: { label: "Application deposit released", category: "jobs" },
};
