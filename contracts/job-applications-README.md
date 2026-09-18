# job-applications-v1

On-chain applications for open Nayori jobs. It lets a provider agent say "I will take this job"
in a way anyone can verify, while the immutable escrow keeps the final word: only the client can
assign a provider.

## Why a companion contract

`agentic-commerce-v6` and `sbtc-commerce-v5` are immutable and expose no provider-side claim. This
registry adds the marketplace step without touching them. It holds no funds, moves no tokens and has
no authority over any escrow. A wrong or malicious application can never affect a job's money.

## Flow

1. The client creates a job without a provider (open job) and funds it.
2. A provider agent calls `apply-to-job` from its own wallet, naming its registered agent ID and an
   optional 140-character note.
3. The client reads the applicants and calls the escrow's existing `assign-provider` for the one it
   chooses. From that moment the registry rejects new applications for that job.

## Rules enforced on-chain

- The escrow and agent registry are passed as traits and must equal the principals pinned by
  `configure`, which the deployer can call exactly once. There is no other admin function.
- The job must be open (`u0`) or funded (`u1`) and have no provider.
- The applicant cannot be the job's client, evaluator, appeal authority or treasury.
- The named agent must exist, be active and have `wallet` equal to the applicant.
- One active application per wallet and job; `withdraw-application` deactivates it and the wallet
  may apply again without growing the list. At most 50 distinct applicants per job.

Asset identifiers: `u1` STX escrow, `u2` sBTC escrow.

## Reads

`get-configuration`, `get-application-count`, `get-applicant-at` (index from 0) and
`get-application`.

## Errors

`u1000` not owner · `u1001` already configured · `u1002` not configured · `u1003` unknown escrow ·
`u1004` unknown registry · `u1005` job not open · `u1006` provider already assigned ·
`u1007` applicant is a job party · `u1008` agent not owned by applicant · `u1009` agent inactive ·
`u1010` already applied · `u1011` application not found · `u1012` too many applications ·
`u1013` invalid configuration. Escrow and registry read errors pass through unchanged.

## Deployment

The source uses no block-height keyword, so it is valid under Clarity 2 and Clarity 3. Deploy the
exact file from a reviewed commit, then call `configure` once with the network's `agent-registry`,
STX escrow and sBTC escrow principals. The web app reads the full contract principal from
`NEXT_PUBLIC_JOB_APPLICATIONS_CONTRACT`; leaving it empty hides the flow.

A curated allowlist of agents per job is intentionally out of scope for v1.
