# Next contract version: trustless escrow, reputation and applications

Date: 2026-11-15

Status: Proposed design, shared for review. Not scheduled for deployment; it will take in further review feedback first.

## Goal

A new set of Clarity 7 contracts with no owner and no administrative powers, following the peer review guidance that trustless designs are preferable. Every rule that affects users is fixed in code. The product flow stays the same: create, fund, deliver, decide, appeal, settle, with a 2% service fee.

New features are kept to the minimum needed.

## Contracts

| Contract | Purpose |
|---|---|
| `nayori-permissions` | Opt-in permissions: which contracts a party allows to act for it. |
| `nayori-roles` | Holds the two remaining roles: the service treasury and the appeal authority. |
| `nayori-escrow-sbtc` | Job escrow in sBTC. |
| `nayori-escrow-stx` | The same escrow in STX. |
| `nayori-reputation` | Job outcomes, ratings and per-provider aggregates. |
| `nayori-applications` | Agents apply to open jobs, with a refundable deposit. |
| `nayori-agents` | Agent identity. |

## Design principles

1. **No owner, no admin functions.** The token, the contracts allowed to write reputation, the limits and the fee are constants.
2. **sBTC is a constant.** The escrow calls the canonical sBTC contract (`SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`) directly and does not take a token parameter.
3. **Bounded payouts.** Every payout uses Clarity 7 `as-contract?` with an allowance limited to the asset and the exact amount of that job.
4. **One clock.** Every deadline is measured in Bitcoin blocks (`burn-block-height`).
5. **Opt-in delegation, as in PoX.** A party is `tx-sender`. A call that reaches Nayori through another contract counts as the party's only if the party allowed that contract first in `nayori-permissions`, optionally until a Bitcoin block height. Allowing and revoking must be called directly by the party. This keeps composition (for example, one agent applying to several jobs in one call) while a contract the party never allowed cannot act for it.
6. **Per-job pinning.** At creation, each job stores its evaluator, deadlines, treasury and appeal authority. Later role changes apply only to new jobs.
7. **Bounded inputs.** Every number a user supplies has a lower and an upper bound (budget, deposit, deadlines), so no single entry can push a calculation or a sorted list out of range.
8. **Distinct parties.** The client, provider, evaluator, appeal authority and treasury of a job are distinct principals. This is checked at creation and at acceptance.

## Roles

The treasury and the appeal authority start as Leather multisig accounts. Only the current holder can propose a successor. The successor accepts after 144 Bitcoin blocks, and the current holder can cancel before then. The two roles can never be the same principal.

| Role | Can | Cannot |
|---|---|---|
| Appeal authority | Resolve disputed jobs pinned to it (approve or reject). | Move funds, receive payouts or change fees. |
| Treasury | Receive the service fee. | Take part in jobs or move escrowed funds. |
| Evaluator | Decide its job within the review window. | Act on other jobs or after the window. |

## Job lifecycle

```
create-job -> OPEN -> fund-job -> FUNDED -> name-provider -> OFFERED -> accept-job -> ACCEPTED
-> submit-work -> SUBMITTED -> decision (evaluator, or default approval after the window) -> DECIDED
-> appeal by the losing party (optional) -> DISPUTED -> resolution or appeal timeout
-> settlement -> COMPLETED / REJECTED
```

1. `create-job` sets the budget (1,000 sats to 100,000,000 sats), the evaluator, the delivery deadline and the review window in one call. Both deadlines must fall within these bounds:
   - delivery: 144 to 4,320 Bitcoin blocks (about 1 to 30 days);
   - review window: 12 to 1,008 blocks (about 2 hours to 7 days), with 144 as the suggested default.
2. `fund-job` deposits exactly the budget from the client's wallet.
3. `name-provider` offers the job to a provider. The client can change the offer until the provider accepts.
4. `accept-job` fixes the provider.
5. `submit-work` must arrive before the delivery deadline.
6. The evaluator approves or rejects within the review window. If the window passes without a decision, anyone can record a **default approval**, which is appealable like any other decision.
7. The losing party may appeal within 144 blocks. The appeal authority resolves it, or the original decision stands once the resolution window passes.
8. Anyone can settle a decided job. The winner receives the budget minus 2%, the job's treasury receives 2%, and reputation is recorded.

Deadline exits:
- If the delivery deadline passes without a submission, anyone can refund 100% to the client, with no fee.
- An unfunded open job simply expires.

Automated agents keep working without any special permission. The evaluator decides with its own wallet, and the keeper settles expired windows. No step requires a specific person to be online.

## Funds

| Event | Recipient | Amount |
|---|---|---|
| Approved (including default approval) | provider, job treasury | budget − 2%, 2% |
| Rejected | client, job treasury | budget − 2%, 2% |
| No delivery by the deadline | client | 100% |
| Application deposit returned (withdrawn, declined, displaced or job closed) | the applicant | the applicant's deposit |

- **Fee:** the budget divided by 50, so at least 20 sats. It is charged on every decision. There are no fee waivers.
- **Funding:** in this version, jobs are funded from standard wallets. Funding from smart-contract wallets is a later addition.

## Reputation, agents and applications

**Reputation.**
- Only the two new escrows can write, and this is fixed in code.
- Each settled job records its outcome, value and client once.
- Only the client rates, once per completed job.
- Each provider's aggregates are: completed jobs, rejected jobs, total settled value, number of distinct clients, and average rating.

**Agents.** An agent's wallet is the principal that registers it, with one agent per wallet.

**Applications.**
- Only registered agents may apply.
- Each application carries a deposit of 100 to 1,000,000 sats. A job keeps at most 50 applications, sorted by deposit.
- When the list is full, a new applicant gets in only by depositing more than the lowest application, which is removed from the bottom and refunded in the same call (the capped, sorted list used by the MIA fair order book).
- Withdrawing returns the deposit and frees the slot.
- The client can decline applicants, which returns their deposits.
- Once a job stops taking applications, anyone can return the remaining deposits, always to the applicant.

## Properties

- **Crowding costs capital and never blocks hiring.** A full list always admits an applicant who deposits more than the lowest one, so keeping an honest agent out means outbidding it every time. Applying is also optional: the client can always offer the job to any provider directly. This is checked with unit tests rather than an rv invariant.
- **Reputation is costly to fake and easy to read** (a documented property, not an rv invariant). Every job pays the 2% fee (at least 20 sats), so self-dealing that fakes a given volume costs 2% of it. Sybil counterparties cannot be prevented on-chain, so the registry keeps raw settled value and the number of distinct clients rather than one score, and readers weigh them.

## Invariants

These are written in each contract with `;; #[env(simnet)]` and fuzzed with Rendezvous. They compare against the real sBTC and STX balances, not only internal totals:

1. The escrow's balance equals the sum of funded, unsettled jobs.
2. The applications contract's balance equals the sum of deposits of active applications.
3. Each job settles once, and net plus fee equals the budget.
4. Payouts go only to the job's parties or its treasury.
5. No funds leave the set of parties and treasuries.

## Testing and review

- Unit tests for every function, on both the success path and each failure path, checking the exact error code. The tests run in the same epoch as mainnet.
- Round-trip properties: applying then withdrawing, and funding then refunding at the deadline, return exactly what went in; a displaced application is refunded exactly its deposit in the same call.
- Rendezvous campaigns:
  - one where every account and role calls functions, including adversarial helper contracts;
  - one that walks the full lifecycle;
  - mutation runs that confirm the invariants catch injected bugs.
- An internal review with independent reviewers and the Clarinet 4 linter. Then external review.
- Testnet end to end with the real evaluator and keeper agents, the SDK and the CLI, plus simulations against a copy of mainnet state.
- `AUDIT.md` (findings, severity, status) and `DECISIONS.md` (short design records) in the repository, and a small public bounty before mainnet.

## Rollout

Mainnet deployment requires epoch 4.1, where Clarity 7 becomes the default, and happens only after review. The roles start as Leather multisig accounts. The app, SDK, CLI, evaluator and keeper then move to the new contracts. Earlier contracts stay as they are; they hold no funds, and the new reputation registry does not accept them.

Work order:
1. roles, sBTC escrow, reputation;
2. STX escrow;
3. agents, applications;
4. integrations.
