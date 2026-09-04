# Earned service fees — candidate contract reference

`agentic-commerce-v6` (STX) and `sbtc-commerce-v5` (sBTC) add a fixed **200 basis-point
service fee** to the autonomous-decision escrow lifecycle. They are **simnet candidates,
not deployed contracts or the current application/SDK defaults**. Production continues to
use STX v5 and sBTC v4 without this fee. Existing jobs and their terms are unchanged.

## Economic policy

The client funds the gross job budget. The fee is included in that budget, not an extra 2%
debit. Funding, submission and decision recording do not pay the treasury. A recorded
evaluation earns a fee that is transferred once, on final settlement, whether the final
decision approves or rejects the work. An appeal reversal is not itself proof of evaluator
fault: a separate evidence-backed waiver handles that determination.

For gross atomic amount `G`, `fee = floor(G / 50)` and `net = G - fee`. Dividing first avoids
uint128 multiplication overflow. Amounts below 50 atomic units have a zero fee; the contract
skips zero-value transfers. No minimum commercial job price is introduced here.

| Final path | Economic recipient | Recipient amount | Treasury amount |
| --- | --- | ---: | ---: |
| Approve, including resolved appeal or appeal timeout | Provider | `net` | `fee` |
| Reject, including resolved appeal or appeal timeout | Client refund | `net` | `fee` |
| Expire before evaluation | Client refund | Funded gross amount | 0 |
| Review timeout without a recorded decision | Provider | Gross amount | 0 |
| Decision pending or disputed | None; funds remain in escrow | 0 | 0 |
| Evidence-backed waiver before settlement | Final economic recipient | Gross amount | 0 |

Example: gross 1,000 atomic units settles as 980 to the provider on approval **or 980 back to
the client on rejection**, plus 20 to treasury. Both legs use the escrow asset. Network
transaction fees remain separate and are paid in STX by the transaction fee payer; this
generation does not introduce sponsorship.

`service-recorded` means the authorized evaluator recorded decision and explanation hashes.
It is an on-chain attestation, **not a proof that the LLM's work was correct**. Service scope,
evidence availability, objective review criteria and operator accountability must accompany
the commercial rollout.

## Initialization and custody

```clarity
(initialize-protocol appeal-window appeal-authority treasury)
```

Initialization is owner-only, one-time and required before job creation. The treasury must
be explicitly supplied and differ from the owner, this escrow contract and appeal authority.
It cannot participate as a job client, provider or evaluator. Each job pins its treasury and
appeal authority. Owner/authority rotation rechecks separation at acceptance, including
overlapping pending rotations. Treasury cannot rotate in this candidate generation.

Review remains 12 Bitcoin burn blocks. Initialization accepts the existing QA 3-block or
mainnet 144-block appeal policy. Selecting 144 is a deployment gate: the contract does not
infer which policy to initialize from the network. No deployment script or default has
been changed by this addition.

The sBTC token remains pinned per funded job. Every SIP-010 transfer checks both the response
and its boolean result: `(err ...)` and `(ok false)` fail the operation. Only an explicitly
approved canonical token should be configured outside simnet; a malicious token returning
`(ok true)` without moving value is outside the SIP-010 trust assumption. The fault-injection
token in this repository is **simnet-only and must never be deployed publicly**.

## Fee inspection and accounting

```clarity
(get-service-fee-for-amount gross)
(get-job-service-fee job-id)
```

The amount quote returns `{ gross, fee, net, basis-points }`.
The job getter returns:

- `basis-points`: fixed 200.
- `treasury`: job-pinned recipient.
- `fee-amount`: potential gross-budget quote, **not revenue or a charge**, even after waiver.
- `service-recorded`: whether decision evidence exists.
- `waiver`: optional 32-byte nonzero evidence hash.
- `settlement`: optional `{ gross, recipient, net, charged-fee, refunded-fee }`.

No settlement entry means no service fee was collected. After collection, net collected fee
is `charged-fee - refunded-fee`. A waiver plus a positive outstanding collected fee is a
refund obligation, not a completed refund. `net` remains the original settlement amount;
total delivered after refund is `net + refunded-fee`.

Events: `service-fee-settled` identifies gross, economic recipient, net, treasury and fee;
`service-fee-waived` identifies authority and evidence; `service-fee-refunded` identifies the
actual returned amount and recipient. Existing terminal-event `amount` still means **gross**,
not provider earnings. Indexers must use the new event/ledger and actual transfer events.
Fees, refunds, escrow volume and externally earned revenue are different metrics.

## Platform-fault waiver and refund

```clarity
(waive-service-fee job-id evidence-hash)
(refund-service-fee job-id)       ;; STX
(refund-service-fee job-id token) ;; sBTC: exact job-pinned token
```

Only the job-pinned appeal authority can irreversibly waive the fee, and only after a decision
exists. Before settlement, a waiver sends the full budget to the final economic recipient.
After settlement, it records an obligation; it cannot claw back a treasury wallet's funds.

The pinned treasury must sign the refund transaction. The contract transfers exactly the
outstanding fee **from treasury's own balance**, never from another job's escrow, to the party
that bore the fee: provider on approval, client on rejection. A failed transfer leaves the
refund outstanding. A successful refund is recorded once and cannot be replayed. The job's
outcome and reputation do not change because a fee was refunded.

This is **not guaranteed automatic recovery** from an insolvent, unavailable or uncooperative
treasury. Commercial launch needs an approved custody/signing policy, funded refund reserves
and a monitored refund process. The tests use public simnet fixtures, not an operational treasury.

## Appeals and x402

Filing `appeal-decision` still has no additional service charge or payment prerequisite.
The normal network transaction fee remains. This preserves the on-chain filing deadline
without making it depend on a quote service or payment confirmation.

Additional paid AI/human analysis is a **separate, not-yet-implemented service**: the requesting
party accepts a scoped quote, preferably paid through x402, with delivery, cost limits and
refund rules. There is no automatic second 2%, unlimited paid retry or pay-to-win rule here.
The service must not replace the eligible party's ability to file an appeal on time.

## Integration boundary and verification

Before enabling these contracts for users:

1. Add SDK ABI/policy support, including the treasury initialization argument and fee getters.
2. Disclose gross, base fee, net payout/refund and gas before funding/acceptance. Update Web,
   Docs, evaluator configuration and settlement receipt/indexer logic together.
3. Keep deny-mode post-conditions for the **aggregate gross escrow outflow per asset**.
   Stacks post-conditions constrain aggregate sender/asset amounts, not the two recipients;
   validate recipient addresses and amounts using contract policy and confirmed events.
   A treasury refund instead constrains the treasury's exact fee outflow.
4. Keep direct-transfer x402/MPP verification separate: its exact-single-transfer checks must
   not be relaxed to accommodate escrow splits.
5. Choose treasury custody/reserves, deploy and initialize in QA/testnet, then run real
   two-role E2E and independent public-state/transfer verification before promotion review.

Local validation uses simnet fixtures, with no operational keys, RPC calls or public-chain transactions:

```bash
npm ci
npm test -- tests/escrow-service-fees.test.ts --silent
npm run security:gate
npm test -- --silent
```

Use the repository-supported Node runtime. The focused suite covers 86 scenarios/parameterized
cases: exact conservation and rounding, approve/reject, appeal reversal/timeouts, no-service
paths, waivers, refunds/insufficient treasury, replay, two-job isolation, token pinning,
SIP-010 failures and role-rotation races. These are simnet integration tests, **not mainnet
E2E, external adoption or an independent security review**.

References: [Stacks post-conditions](https://docs.stacks.co/post-conditions/examples),
[Clarity functions](https://docs.stacks.co/reference/clarity/functions),
[x402 overview](https://docs.x402.org/introduction).
