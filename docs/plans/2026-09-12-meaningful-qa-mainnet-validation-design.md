# Meaningful QA and mainnet validation campaign

Status: approved for implementation on 2026-09-12
Scope: internal technical validation and SDK demo preparation
Classification: `internal-team-operated-not-m2-adoption`

## Objective

Validate the public `@perkos/agent-sdk@0.8.0`, the selected contracts, agent roles and production
evidence surface with work that has an actual product outcome. The campaign must not manufacture
usage, describe internal wallets as external adoption or use generic labels such as “test job”.
Every on-chain description names the business result, and every deliverable is a reproducible JSON
or Markdown report whose SHA-256 digest is committed on chain.

## Execution order

1. Install exactly `@perkos/agent-sdk@0.8.0` from the public npm registry in a clean directory
   outside every Git repository and verify registry integrity.
2. Execute the full agent-registration and sBTC lifecycle in QA/testnet with two distinct
   PerkOS-controlled agent signers. Validate the 2% included service-fee split.
3. Reconcile all transaction confirmations, contract state, escrow, payout, reputation and the QA
   evidence API before considering mainnet.
4. Promote the exact QA-verified STX v6 and sBTC v5 sources as new immutable mainnet contracts,
   initialize the 144-block appeal policy and dedicated treasury, and independently verify every
   source, configuration and reputation allowlist before changing any consumer default.
5. Update SDK, Web, Evaluator, API/evidence indexer and Docs together, then run only the reviewed
   mainnet scenarios below against v6/v5 and validate the included 98/2 split.
6. Reconcile `https://nayori.ai/evidence` and its JSON feed after Hiro reaches canonical state.

## Business scenarios

| ID | Network/asset | Work product | Terminal behavior |
| --- | --- | --- | --- |
| Q01 | QA / sBTC | Verify the published SDK 0.8.0 package, build a signer-free escrow plan and deliver a reproducibility receipt | approve, final payout 98%, earned Nayori fee 2% |
| P01 | mainnet / sBTC | Audit Nayori agent-readiness and deployment discovery endpoints; deliver status, content type, network/contract assertions and response hashes | evaluator applies the published criteria; approve waits through the appeal window, while a genuine rejection may be corrected and appealed |
| P02 | mainnet / STX | Review production developer onboarding links and contract-version guidance; deliver a reproducible link and configuration report | evaluator applies the published criteria; settlement follows the resulting ordinary or genuine appeal path |

No scenario forces an artificial appeal or predetermines an evaluator result. An approved,
unappealed mainnet job waits until strictly after the immutable 144-burn-block appeal deadline.
A rejected job is appealed only when the provider actually supplies corrected evidence. Controlled
internal operation and meaningful work do not make these cases external adoption.

## Safety and accounting limits

- QA must pass first and remains Stacks testnet only.
- Mainnet requires the exact production deployer, v6/v5/reputation-v3 source locks, canonical PoX-5
  sBTC, the dedicated treasury and distinct client/provider/evaluator/authority principals.
- Proposed aggregate mainnet cap: 200 sats of escrow, 100,000 micro-STX of escrow and 6,000,000
  micro-STX for fees/top-ups. A preflight must stop before signing if any cap is exceeded.
- One action is broadcast at a time. A mode-0600 durable journal records intent before signing,
  then txid, confirmation and state. Ambiguous attempts are reconciled rather than retried.
- Receipts contain public addresses and transaction data only. Keys, mnemonics, tokens, secret
  paths, LLM credentials and private evidence URLs never enter Git or public artifacts.
- All internal actors remain labeled `internal-team-operated-not-m2-adoption` in private and public
  reporting. These jobs do not satisfy non-team wallet or external SDK adoption requirements.

## Acceptance criteria

Each case must prove the installed SDK version/integrity, exact network and contracts, distinct
roles, meaningful task and criteria hashes, confirmed success for every intended transaction,
terminal contract status, zero escrow, exactly one economic outcome, correct reputation state and
visibility in the matching public evidence feed. Any failed or ambiguous invariant stops the batch.
