# Versioned escrow liveness and settlement hardening

Date: 2026-08-29  
Status: Approved for implementation  
Scope: STX escrow, sBTC escrow and job-linked reputation

## Context and goals

The approved M1 contracts remain immutable historical evidence, but they are not the release target
for external onboarding. The pre-launch review reproduced a liveness failure: after a provider
submits work, an unavailable evaluator can leave STX or sBTC escrow locked indefinitely. The same
review found four related hardening opportunities: reputation identifiers collide across commerce
contracts, a global sBTC token change can affect an already funded job, ownership transfers are
single-step, and failed advisory reputation writes are not durably visible or retryable.

The release candidate must preserve non-custodial settlement, keep the three job roles distinct,
avoid counting timeout payouts as successful M2 completions, and remain compatible with exact
`deny` post-conditions in the Web and SDK. No production address changes or mainnet writes are part
of this implementation PR.

## Considered approaches

### 1. Edit the existing sources and keep the deployed names

This creates misleading source-to-deployment relationships because deployed Clarity contracts are
immutable. It also makes M1 evidence harder to reproduce. Rejected.

### 2. Version only the two escrow contracts

This resolves the locked-funds path with the fewest deployments, but the existing reputation API
cannot namespace a job by source contract or make outcome retries idempotent. It leaves two audit
findings open. Rejected.

### 3. Deploy a versioned contract trio

Create `reputation-registry-v3`, `agentic-commerce-v3` and `sbtc-commerce-v2`. The original files,
addresses and M1 evidence remain untouched. The new trio can be frozen as one external-review
candidate and activated only after simnet, testnet and independent review gates pass. Selected.

## Contract architecture

Both commerce contracts use seven states: `OPEN` (0), `FUNDED` (1), `SUBMITTED` (2), `COMPLETED`
(3), `REJECTED` (4), `EXPIRED` (5) and `TIMEOUT_PAID` (6). Job creation and pre-submission expiry
continue to use Stacks `block-height`. When the provider submits, the contract records the current
`burn-block-height` and a fixed review deadline of current Bitcoin height plus 144 blocks.

The evaluator may complete or reject while `burn-block-height <= review-deadline`, including the
exact deadline. Once `burn-block-height > review-deadline`, any principal may call
`settle-review-timeout`. This call pays the provider, clears escrow and sets `TIMEOUT_PAID`. It does
not call reputation, does not enable ratings and must be excluded from completed-job and M2 usage
metrics. The permissionless caller receives no funds or special authority.

Before submission, `expire-job` continues to refund an eligible `OPEN` or `FUNDED` job to the
client. After submission, the review deadline is the only liveness clock. This prevents the
original job expiry from racing the evaluator's review period.

The sBTC contract stores the selected SIP-010 contract against the job when funding succeeds.
Completion, rejection, expiry and timeout validate the caller-supplied trait against that stored
job token, not the mutable default token. An owner change to the default therefore affects only
future funding.

## Reputation and retry model

`reputation-registry-v3` derives `source` from the authorized calling commerce contract. Rating
keys contain `(source, agent, rater, job-id)` and outcome keys contain `(source, job-id)`. STX job
`u1` and sBTC job `u1` are therefore independent. Outcome insertion is idempotency-protected, so a
completed or disputed job can increment aggregates only once.

Escrow settlement remains primary and reputation remains advisory. After a normal completion or
rejection, the commerce contract calls the registry. It stores a per-job synchronization record
with the outcome, pending flag and last registry error. A failure does not roll back payment. Any
principal may later call `retry-reputation-sync`; success clears the pending flag, while another
registry error remains visible and returns a non-fatal `ok false`. Timeout payouts intentionally
create no reputation operation.

Ratings remain explicit user operations and atomic: only the client or evaluator of a
`COMPLETED` job may rate, once per rater. A failed registry rating call rolls back the rating
transaction and the authorized rater can submit it again.

## Ownership and administrative safety

Each new contract replaces immediate `set-owner` behavior with two-step ownership:

1. The current owner calls `propose-owner`.
2. Only the proposed principal can call `accept-owner`.
3. The current owner may cancel or replace a pending proposal before acceptance.

Read-only access exposes both current and pending owner. Events cover proposal, acceptance and
cancellation. This prevents a typo from irreversibly transferring control. The reputation
allowlist and the sBTC default-token setter remain owner-only.

## Client and data flow

1. Client creates, budgets and funds a job with exact debit/escrow post-conditions.
2. Client assigns a distinct provider.
3. Provider submits a deliverable; the Bitcoin review deadline becomes immutable for that job.
4. Before or at the deadline, the evaluator completes or rejects with exact payout/refund
   post-conditions.
5. After the deadline, any caller can trigger an exact provider payout and `TIMEOUT_PAID` state.
6. Normal settlement records or queues the job outcome in reputation; a queued write is publicly
   retryable.
7. Web, SDK, indexer and evidence surfaces treat status 6 separately and never count it as a
   successful completion.

## Errors and events

The versioned contracts use new, non-overlapping error ranges. Dedicated errors distinguish a
closed evaluator window, a timeout requested too early, a missing review deadline, a missing or
mismatched job token, invalid ownership acceptance, absent pending reputation and duplicate
registry outcomes.

Every economic transition prints the job ID, relevant role, amount and final status. Submission
prints both submission and review-deadline Bitcoin heights. Timeout prints the permissionless
caller and provider payout. Reputation sync events distinguish success, pending and retry.

## Verification plan

Simnet tests must cover STX and sBTC happy paths plus both boundaries: evaluator settlement at the
exact deadline succeeds, while timeout requires the following Bitcoin block. Tests must prove that
timeout pays only the provider, clears escrow, is callable by an unrelated wallet, cannot be rated
and does not increment completed reputation.

Additional regressions cover pre-submission expiry, token rotation after funding, cross-protocol
job-ID isolation, duplicate outcome rejection, failed reputation sync and permissionless retry,
two-step ownership/cancellation, unauthorized administration, role separation and exact balance
changes. The original 77 tests must remain green. A later integration phase updates Web and SDK
transaction builders with exact `deny` post-conditions, exercises testnet with controlled wallets
and freezes source hashes and addresses for the independent review. Production activation remains
blocked until the external review and Critical/High disposition are complete.
