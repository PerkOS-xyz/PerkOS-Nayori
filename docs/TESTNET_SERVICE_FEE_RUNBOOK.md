# Earned service fees: guarded testnet validation

This runbook prepares **STX v6 and sBTC v5**. It does not activate production, change Web/SDK
defaults, publish npm, deploy the LLM evaluator or demonstrate external adoption. Sources are
frozen in `scripts/service-fee-testnet-core.mjs`. Existing v5/v4 runners remain unchanged.

## Release and custody boundaries

Use a clean checkout of the reviewed merge to `qa`, fetch `origin/qa`, and set its full SHA as
`SERVICE_FEE_REVIEWED_SHA`. Execution verifies HEAD, ancestry to `origin/qa`, frozen source
digests, the security gate and the complete test suite **before reading signer files**. Network
is fixed to the canonical Hiro testnet API; there is no mainnet execution branch.

The deployer/client, evaluator and appeal authority are the existing separate QA principals.
Provide two additional distinct standard testnet principals: a treasury and a persistent provider.
Never use throwaway in-memory provider keys for resumable funded jobs. Do not use any QA key
with real assets or treat the QA treasury as approval of a production treasury.

Signer files must be absolute, owned, mode `0600`, non-symlink paths; keep them outside Git or
explicitly ignored and untracked. Do not `source` them into the shell. Only their paths are passed
to the commands; key values must not appear in command history, evidence or browser bundles.

| Path variable                   | Fields read, only during execution                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `SERVICE_FEE_DEPLOYER_ENV_PATH` | `DEPLOYER_PRIVATE_KEY` for candidate deployment/configuration                         |
| `SERVICE_FEE_ACTORS_ENV_PATH`   | `DEPLOYER_PRIVATE_KEY`, `QA_EVALUATOR_PRIVATE_KEY`, `QA_APPEAL_AUTHORITY_PRIVATE_KEY` |
| `SERVICE_FEE_PROVIDER_ENV_PATH` | `QA_PROVIDER_PRIVATE_KEY`                                                             |
| `SERVICE_FEE_TREASURY_ENV_PATH` | `NAYORI_QA_TREASURY_PRIVATE_KEY`, only for refund scenarios                           |

Every key must derive its expected public testnet role. A local `.env.qa` containing only the
treasury variables is **not** a full actors or deployer environment. Treasury is pinned once
at initialization; reject mismatched existing configuration instead of silently replacing it.

## 1. Signer-free deployment preflight

```bash
SERVICE_FEE_TREASURY_ADDRESS=<testnet-treasury> npm run preflight:service-fee:testnet
```

Preflight checks node identity, byte-exact existing dependencies, candidate name occupancy,
owner, treasury/policy, canonical PoX-5 sBTC, reputation caller authorization, mempool and nonce.
It prints the remaining operations and fee ceilings, without loading any signer or constructing
a transaction. With both candidates absent, the plan is two deploys and five configuration calls.

Fixed test ceilings are 1,000,000 micro-STX per deploy and 5,000 per call; deployment retains
500,000 micro-STX in reserve. These are explicit transaction fees, **not a dynamic market quote**.
If inadequate, stop for review; do not automatically raise fees or top up wallets.

## 2. Deploy only the reviewed QA release

```bash
STACKS_NETWORK=testnet \
SERVICE_FEE_ACTION=deploy \
SERVICE_FEE_REVIEWED_SHA=<reviewed-qa-merge-sha> \
SERVICE_FEE_TREASURY_ADDRESS=<testnet-treasury> \
CONFIRM_SERVICE_FEE_TREASURY=<same-testnet-treasury> \
CONFIRM_SERVICE_FEE_TESTNET=deploy-v6-v5-testnet \
SERVICE_FEE_DEPLOYER_ENV_PATH=/external/secrets/qa-deployer.env \
SERVICE_FEE_RESULT_PATH=/external/evidence/fee-deploy.json \
npm run deploy:service-fee:testnet
```

Create the external evidence directory first. Receipts must be outside **every** Git repository.
The runner preserves old contracts, initializes each candidate with appeal window `u3`, authority
and treasury, configures only canonical testnet sBTC and adds the two reputation callers. It
verifies every canonical anchored transaction and `(ok true)`, then repeats the complete plan:
no operation may remain. Deployment alone does not switch application/evaluator consumers.

## 3. Controlled two-role contract E2E

Run each scenario separately for `stx` and `sbtc`: **ten scenarios × two assets = twenty paths**.
Use only team-operated QA actors, never count them as external adoption or revenue.

| Scenario                        | Final result                                   | Fee / real return                        | Timing                                         |
| ------------------------------- | ---------------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| `approve-no-appeal`             | Provider paid                                  | 2% to treasury                           | After appeal deadline                          |
| `reject-no-appeal`              | Client net refund                              | 2% to treasury                           | After appeal deadline                          |
| `approve-appeal-resolve-reject` | Approval reversed; client net refund           | 2% once                                  | Authority resolves appeal                      |
| `reject-appeal-resolve-approve` | Rejection reversed; provider paid              | 2% once                                  | Authority resolves appeal                      |
| `approve-appeal-timeout`        | Original approval preserved                    | 2% once                                  | After resolution deadline                      |
| `review-timeout`                | Provider gross payout, non-completion state u6 | No fee or fabricated decision/reputation | After review deadline                          |
| `waive-approve`                 | Provider receives gross                        | Evidence-backed waiver before settlement | Resolved appeal                                |
| `waive-reject`                  | Client receives gross                          | Evidence-backed waiver before settlement | Resolved appeal                                |
| `refund-approve`                | Provider net, then real fee return             | Treasury signs its own exact outflow     | Resolved appeal, post-settlement waiver/refund |
| `refund-reject`                 | Client net, then real fee return               | Treasury signs its own exact outflow     | Resolved appeal, post-settlement waiver/refund |

Budgets are fixed: 100,000 micro-STX or 1,000 satoshis. Fee is included in gross. Preflight prints
balances and conservative per-role gas requirements. A new job is refused unless all roles are
funded sufficiently, including treasury refund gas. There are no automatic actor transfers.
Client assignment is explicit; the provider cannot claim arbitrary jobs. Signer consent in this
controlled runner is not a browser-wallet consent test or a real SDK/Hermes integration test.

```bash
SERVICE_FEE_TREASURY_ADDRESS=<testnet-treasury> \
SERVICE_FEE_PROVIDER_ADDRESS=<persistent-testnet-provider> \
SERVICE_FEE_ASSET=sbtc \
SERVICE_FEE_SCENARIO=refund-approve \
npm run preflight:e2e:service-fee:testnet
```

For execution pass those four public variables plus:

```bash
STACKS_NETWORK=testnet \
SERVICE_FEE_ACTION=run \
SERVICE_FEE_TREASURY_ADDRESS=<testnet-treasury> \
SERVICE_FEE_PROVIDER_ADDRESS=<persistent-testnet-provider> \
SERVICE_FEE_ASSET=sbtc \
SERVICE_FEE_SCENARIO=refund-approve \
SERVICE_FEE_REVIEWED_SHA=<reviewed-qa-merge-sha> \
CONFIRM_SERVICE_FEE_TESTNET=run-v6-v5-testnet \
CONFIRM_SERVICE_FEE_TREASURY=<same-testnet-treasury> \
SERVICE_FEE_ACTORS_ENV_PATH=/external/secrets/qa-actors.env \
SERVICE_FEE_PROVIDER_ENV_PATH=/external/secrets/qa-provider.env \
SERVICE_FEE_TREASURY_ENV_PATH=/external/secrets/qa-treasury.env \
SERVICE_FEE_RESULT_PATH=/external/evidence/sbtc-refund-approve.json \
npm run e2e:service-fee:testnet
```

Keep a distinct receipt per asset/scenario and execute **sequentially**, never concurrent jobs
sharing signers. No job-ID override is accepted: recovery is bound to the original receipt,
reviewed SHA, actors, scenario and returned create-job transaction.

## Recovery, deadlines and evidence

Each operation records its intent hash, nonce and locally derived txid durably **before** broadcast.
Rerunning with the same receipt observes existing txids; it never re-signs or retransmits that
operation. A timeout, rejection, conflicting receipt or dropped transaction requires inspection.
Do not delete the receipt to force a retry. An unexplained 404 is not authorization to rebroadcast.
A journal lock rejects concurrent access; a per-host account lock also serializes different
receipts sharing the QA deployer. It is not a distributed lock: designate one execution host.
Remove a stale lock only after confirming the prior
process is gone, its chain status is understood and the operator approves recovery.

Delayed scenarios return `awaiting-deadline`. Resume the same command/receipt only when burn
height is **strictly greater** than the recorded deadline. The runner repeats the live check and
does not sign early. Immediate appeal/resolution also checks that its window remains open.
No scheduler, background rebroadcast or blanket deadline bypass is installed.

The final check requires exact canonical transfer events, both split legs, one settlement print,
matching job/fee ledger, terminal state, zero escrow and correct reputation. Refunds require a
separate canonical treasury-to-economic-recipient transfer and updated `refunded-fee`; a waiver
alone cannot pass. All monetary events are inspected, including asset identity and extra/missing
legs. The HTTP challenge smoke tests are separate and do not prove a paid delivery.

Local unit tests cover the accounting oracle, guards, permissions, nonce gaps, changed intentions
and ambiguous-broadcast recovery. They are **not evidence that these twenty paths ran on-chain**.
Archive actual receipts and SHA-256 digests externally after execution; record known limitations.

No mainnet rollout, SDK release, consumer migration or external-audit claim follows automatically.
