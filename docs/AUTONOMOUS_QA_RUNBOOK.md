# Autonomous escrow QA runbook

This runbook deploys and exercises `agentic-commerce-v5` and `sbtc-commerce-v4` on Stacks
testnet. It has no mainnet mode. It does not deploy Web, API, OAuth or Evaluator containers and it
does not publish an npm package.

Use an external mode-`0600` environment file outside Git containing these fields:

```text
DEPLOYER_ADDRESS=ST...
DEPLOYER_PRIVATE_KEY=...
QA_EVALUATOR_ADDRESS=ST...
QA_EVALUATOR_PRIVATE_KEY=...
QA_APPEAL_AUTHORITY_ADDRESS=ST...
QA_APPEAL_AUTHORITY_PRIVATE_KEY=...
```

The three persistent principals must be distinct. Every job also receives a separate provider
principal generated only in memory. Never place the environment file, private keys or raw evidence
in Git, logs, receipts or documentation.

## Deployment

Review the exact commit, contract sources, QA authority and maximum fees before setting the typed
guard:

```bash
STACKS_NETWORK=testnet \
CONFIRM_AUTONOMOUS_ESCROW_TESTNET_DEPLOY=yes \
AUTONOMOUS_ESCROW_TESTNET_ENV_PATH=/absolute/path/to/qa.env \
AUTONOMOUS_ESCROW_TESTNET_RESULT_PATH=/absolute/path/to/deploy-receipt.json \
npm run deploy:autonomous:testnet
```

The runner verifies any existing contract source byte-for-byte, deploys missing dependencies in
order, pins the official PoX-5 testnet sBTC token, authorizes both escrow contracts in
`reputation-registry-v3`, and initializes an immutable three-burn-block appeal window with the
separate QA authority. Re-running the same source and configuration is safe; conflicting source or
configuration fails closed.

## Role E2E

Run each scenario separately for `stx` and `sbtc`:

```text
approve-no-appeal
reject-no-appeal
approve-appeal-resolve-reject
reject-appeal-resolve-approve
approve-appeal-timeout
review-timeout
```

Example:

```bash
STACKS_NETWORK=testnet \
CONFIRM_AUTONOMOUS_ESCROW_TESTNET_E2E=yes \
AUTONOMOUS_ESCROW_TESTNET_ENV_PATH=/absolute/path/to/qa.env \
AUTONOMOUS_ESCROW_E2E_ASSET=stx \
AUTONOMOUS_ESCROW_E2E_SCENARIO=approve-no-appeal \
AUTONOMOUS_ESCROW_E2E_RESULT_PATH=/absolute/path/to/receipt.json \
npm run e2e:autonomous:testnet
```

Immediate human-resolution scenarios finish in one run. The other scenarios stop after preparing
the exact on-chain state and record a burn-height deadline without broadcasting an early
settlement. Resume after that deadline with the same asset/scenario and the public job ID:

```bash
AUTONOMOUS_ESCROW_E2E_JOB_ID=42
```

The runner verifies exact source and protocol configuration before every execution. Funding and
settlement calls use deny-mode post-conditions, terminal checks require the expected state, escrow
zero, exact final decision and a non-pending reputation update where an evaluator decision exists.
The review-timeout path instead proves that no evaluator decision or reputation decision was
fabricated. Receipts contain public principals and transaction evidence only and are classified
`internal-team-operated-not-m2-adoption`.

## Release boundary

The current Evaluator service includes deterministic validation, structured primary/verifier
agreement, durable evaluation storage and an allowlisted `record-decision` adapter interface. Its
public runtime exposes read-only health/readiness/evaluation routes. The event polling, production
signer adapter and autonomous broadcast loop remain a later security-gated increment; until then,
the controlled E2E runner acts as the transaction orchestrator. Do not describe that runner as
external adoption, autonomous production operation or grant revenue.
