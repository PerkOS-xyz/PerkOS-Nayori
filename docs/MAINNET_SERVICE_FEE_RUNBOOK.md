# Mainnet service-fee promotion runbook

## Completed deployment — 2026-09-13 UTC

The reviewed merge `887ee9b01d5a880373aa868970e0ff83a6f6731a` completed this runbook. All seven
transactions confirmed `(ok true)` in Stacks blocks `8978368`–`8978385` and were revalidated after
the required two-block depth. The deployment receipt SHA-256 is
`973633a6c793811b04e0e996c8170c7968916f7282d065b57832d1978adb7af1`; the campaign marker SHA-256
is `ea1c03123214445e12c099c39d5ff8b0416d4c5d7abdbad8054324edbf3b4fc0`. Both artifacts remain
outside Git. The procedure below is retained for audit and recovery and must not be replayed.

This runbook promoted the QA-verified earned-service-fee contracts as **new immutable contracts**:

- `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.agentic-commerce-v6`
- `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce-v5`

It never modifies or removes the existing v5/v4 contracts or their historical jobs. Deployment
alone does not switch Web, SDK, Evaluator, API, Docs or evidence indexing to the new generation.

## Frozen production policy

| Setting | Mainnet value |
| --- | --- |
| Gross-budget service fee | 200 basis points (2%) |
| Provider/refund recipient | 98% when a fee is earned |
| Review window | 12 Bitcoin burn blocks |
| Appeal window | 144 Bitcoin burn blocks |
| Appeal authority | `SP28DBK3Q89F4KRYGPF51QT0RYEZBPXS4BAQ0ETBH` |
| sBTC token | `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` |
| Treasury | `SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8` (dedicated Leather account) |
| Maximum deployment fees | 3,000,000 micro-STX |
| Required retained deployer reserve | 5,000,000 micro-STX |

The client funds the gross job budget; the fee is not an additional 2% debit. Expiry before an
evaluation and review timeout without a decision do not earn a fee. An appeal does not create a
second automatic fee. See [`contracts/service-fees-README.md`](../contracts/service-fees-README.md)
for settlement, waiver and treasury-refund semantics.

## Preconditions

1. Both candidate source hashes match the reviewed commit and the full test/security gate passes.
2. That exact commit is merged into `origin/main`; the execution checkout is clean.
3. The two contract names remain absent on mainnet, or exist with byte-for-byte matching source.
4. The dedicated Leather treasury address and custody/backup policy have been approved. Never use
   the deployer, appeal authority, a participant wallet or the QA treasury.
5. The deployer has no pending transaction or nonce gap and retains the fixed reserve after fees.
6. The deployer signer file is owned by the operator, mode `0600`, not a symlink and never tracked
   by Git. No treasury seed or private key is exported from Leather.
7. The receipt path is absolute, outside every Git repository and has an existing parent.
8. A dedicated campaign-state directory exists outside Git, is operator-owned and mode `0700`.
   Its permanent marker binds the entire v6/v5 campaign and 3 STX cap to one receipt.

## Leather custody attestation

After the exact release commit is merged to `main`, open the operator-only attestation page from a
local build of `App`:

```bash
cd App
npm ci --ignore-scripts
npm run dev
```

In Chrome, visit
`http://localhost:3000/operations/treasury-attestation?reviewedSha=<exact-merged-main-sha>`.
Review every field, connect the mainnet Leather account whose address is exactly
`SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8`, and approve the SIP-018 message. This is not a
transaction and has no network fee. It does not authorize the deployer to spend treasury funds.

Move the downloaded JSON to the approved external evidence directory and restrict it before use:

```bash
chmod 600 <absolute-external-treasury-attestation-json>
```

The attestation contains public data only: the signed custody-proof context, random challenge,
public key and signature. Nevertheless it is treated as an operator-controlled release artifact. The promoter
accepts it only for the exact reviewed SHA and within its 24-hour validity window. It verifies the
canonical SIP-018 signature locally, requires the downloaded canonical JSON encoding and confirms
that the public key derives the frozen treasury.
Never paste or export the Leather Secret Key/private key.

The treasury should retain a bounded STX gas reserve for manually approved fee-refund calls. Sweep
revenue above the approved operating reserve to cold custody under a separately reviewed policy.

Prepare the one-time external state directory before armed execution (replace the placeholder with
the approved evidence location):

```bash
umask 077
mkdir -p <absolute-external-campaign-directory>
chmod 700 <absolute-external-campaign-directory>
```

Do not reuse that directory for another campaign or manually create its marker file.

## Signer-free preflight

Preflight performs only allowlisted public reads. It does not open the signer or attestation file,
and it does not construct a transaction.

```bash
SERVICE_FEE_MAINNET_TREASURY_ADDRESS=<dedicated-mainnet-treasury> \
npm run preflight:service-fee:mainnet
```

Review the reported source hashes, occupied names, nonce, balance, exact operation list and total
fee budget. A new preflight is mandatory immediately before execution because contract names and
nonces can change.

## Armed execution

Create a fresh detached worktree of the exact merged SHA under
`/private/tmp/nayori-mainnet-release-<sha>`. Set the receipt to the approved external evidence
directory and paths to the external deployer signer and public treasury attestation. Do not copy
either artifact into the execution checkout. The deploy command first replaces `node_modules` with `npm ci
--ignore-scripts` from the reviewed lockfile; no imported signing dependency is reused from the
development workspace. `NODE_OPTIONS`, `NODE_PATH` and npm equivalents must be empty; the wrapper
then launches Node with an allowlisted environment and a runtime attestation tied to the SHA,
lockfile and ephemeral root.

```bash
STACKS_NETWORK=mainnet \
SERVICE_FEE_MAINNET_ACTION=deploy \
SERVICE_FEE_MAINNET_REVIEWED_SHA=<exact-merged-main-sha> \
SERVICE_FEE_MAINNET_LOCKFILE_SHA256=<reviewed-package-lock-sha256> \
SERVICE_FEE_MAINNET_TREASURY_ADDRESS=<dedicated-mainnet-treasury> \
SERVICE_FEE_MAINNET_DEPLOYER_ENV_PATH=<absolute-mode-0600-mainnet-env> \
SERVICE_FEE_MAINNET_TREASURY_ATTESTATION_PATH=<absolute-mode-0600-attestation-json> \
SERVICE_FEE_MAINNET_RECEIPT_PATH=<absolute-external-receipt-json> \
SERVICE_FEE_MAINNET_STATE_DIR=<absolute-external-mode-0700-campaign-directory> \
CONFIRM_SERVICE_FEE_MAINNET=deploy-v6-v5-mainnet \
CONFIRM_SERVICE_FEE_MAINNET_DEPLOYER=SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH \
CONFIRM_SERVICE_FEE_MAINNET_AUTHORITY=SP28DBK3Q89F4KRYGPF51QT0RYEZBPXS4BAQ0ETBH \
CONFIRM_SERVICE_FEE_MAINNET_TREASURY=<same-dedicated-mainnet-treasury> \
CONFIRM_SERVICE_FEE_MAINNET_TREASURY_ATTESTATION_PATH=<same-absolute-attestation-json> \
CONFIRM_SERVICE_FEE_MAINNET_RECEIPT_PATH=<same-absolute-receipt-json> \
CONFIRM_SERVICE_FEE_MAINNET_STATE_DIR=<same-absolute-campaign-directory> \
CONFIRM_SERVICE_FEE_MAINNET_MAX_FEES_MICRO_STX=3000000 \
CONFIRM_SERVICE_FEE_MAINNET_EPHEMERAL_ROOT=<same-absolute-ephemeral-worktree> \
npm run deploy:service-fee:mainnet
```

The runner executes strictly serially and waits for canonical anchored success before the next
nonce. It validates and records each complete intent, exact signed bytes and deterministic txid
before broadcast. If broadcast is ambiguous, preserve the receipt for reconciliation; an orderly
fail-closed exit releases its active locks, while a process crash leaves both locks in place for
manual recovery. Recovery may only rebroadcast the byte-identical saved transaction; never create
a fresh receipt or manually advance the nonce. Final success requires two additional Stacks blocks
and canonical revalidation of every transaction.

The campaign marker `v6-v5-campaign.json` is permanent and mode `0600`. Never delete or replace it
to start a new receipt: confirmed or failed on-chain attempts may already have consumed part of the
campaign fee cap. The same serialized txid rebroadcast from the journal counts once.

If the process terminates abruptly, both the receipt lock and global deployer lock intentionally
remain in place. They contain only PID, host, start time, receipt path and source commit. Recovery
is fail-closed: confirm the process no longer exists on the recorded host, validate the journal
mode/binding and campaign marker, reconcile every recorded txid plus the deployer mempool and nonce,
then preserve the old locks by renaming them with a `.stale-<timestamp>` suffix under an explicitly
reviewed recovery procedure. Never auto-delete or auto-recover a lock because of age alone.

## Expected operation order

1. Deploy `agentic-commerce-v6`.
2. Authorize v6 in `reputation-registry-v3`.
3. Initialize v6 with appeal window, authority and treasury.
4. Deploy `sbtc-commerce-v5`.
5. Pin canonical PoX-5 sBTC.
6. Authorize sBTC v5 in `reputation-registry-v3`.
7. Initialize v5 with the same policy.

Already completed exact operations are observed and skipped. Any source, owner, policy, token,
treasury, authority, nonce or fee mismatch stops the run.

The attestation proves custody only for deployment. If an earned service fee is later waived, the
treasury account must submit the exact one-shot refund call from Leather after human review. The
appeal authority cannot spend the treasury and the deployment process never receives its key.

## Promotion after contract deployment

Do not expose the new generation to users until all of the following are complete:

1. Independent postflight confirms exact sources, configuration, token and reputation allowlists.
2. SDK/config defaults and release notes reference v6/v5.
3. Web, Evaluator, API/evidence indexer and Docs use the same addresses and disclose gross/net/fee.
4. Controlled meaningful STX and sBTC mainnet jobs confirm 98/2 transfers, one settlement, escrow
   zero, terminal state and reputation synchronization.
5. Production evidence identifies those jobs as
   `internal-team-operated-not-m2-adoption`; they are not external M2 adoption.
6. The external security reviewer receives the exact deployed sources and receipts.

## Controlled v6/v5 consumer E2E — not yet executed

The active `e2e:autonomous:mainnet` alias is reserved for one reviewed v6/v5 STX canary followed
strictly by one sBTC canary. It does not deploy contracts. Its default action is a signer-free
public preflight of both assets:

```bash
STACKS_NETWORK=mainnet \
SERVICE_FEE_MAINNET_E2E_ACTION=preflight \
SERVICE_FEE_MAINNET_E2E_REVIEWED_SHA=<exact-clean-reviewed-sha> \
npm run preflight:e2e:autonomous:mainnet
```

The wrapper checks the exact v6/v5 source hashes, mainnet identity, owners and pending roles, reputation
allowlists, policy, token and current job counts. It neither reads a signer nor constructs or
broadcasts a transaction.

Armed execution is intentionally unavailable through GitHub Actions. Create a fresh detached
`/private/tmp/nayori-mainnet-e2e-release-*` worktree at the exact reviewed commit already contained
by `origin/main`; never run it from a persistent checkout. The hardened launcher verifies the
reviewed lockfile, rebuilds dependencies with `npm ci --ignore-scripts --no-audit --no-fund`, checks
the tree remains clean, and then uses `env -i` to pass only the documented allowlist into the signer
process. It also requires separate external regular
files owned by the operator with exact mode `0600`, and a new receipt path outside Git. The client
file contains a dedicated canary `CLIENT_PRIVATE_KEY` and may include `CLIENT_ADDRESS`; it must not
contain or derive the contract-owner/deployer key. The actor file contains
`PROVIDER_PRIVATE_KEY` and `EVALUATOR_PRIVATE_KEY`; the authority file contains
`MAINNET_APPEAL_AUTHORITY_PRIVATE_KEY` and may include
`MAINNET_APPEAL_AUTHORITY_ADDRESS`. Any declared address must match its key. Actor addresses are
derived locally and must equal their separate typed confirmations; private keys are never written
to the receipt.

```bash
STACKS_NETWORK=mainnet \
SERVICE_FEE_MAINNET_E2E_ACTION=execute \
SERVICE_FEE_MAINNET_E2E_REVIEWED_SHA=<exact-merged-main-sha> \
SERVICE_FEE_MAINNET_E2E_LOCKFILE_SHA256=<reviewed-package-lock-sha256> \
CONFIRM_SERVICE_FEE_MAINNET_E2E_EPHEMERAL_ROOT="$PWD" \
SERVICE_FEE_MAINNET_E2E_CLIENT_ENV_PATH=<absolute-client-mode-0600-env> \
SERVICE_FEE_MAINNET_E2E_ACTOR_ENV_PATH=<absolute-actors-mode-0600-env> \
SERVICE_FEE_MAINNET_E2E_AUTHORITY_ENV_PATH=<absolute-authority-mode-0600-env> \
SERVICE_FEE_MAINNET_E2E_CAMPAIGN_PATH=<new-absolute-external-campaign-json> \
SERVICE_FEE_MAINNET_E2E_STX_RESULT_PATH=<new-absolute-external-stx-receipt-json> \
SERVICE_FEE_MAINNET_E2E_SBTC_RESULT_PATH=<new-absolute-external-sbtc-receipt-json> \
CONFIRM_SERVICE_FEE_MAINNET_E2E=execute-controlled-v6-v5-mainnet \
CONFIRM_SERVICE_FEE_MAINNET_E2E_DEPLOYER=SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH \
CONFIRM_SERVICE_FEE_MAINNET_E2E_CLIENT=<derived-dedicated-client-address> \
CONFIRM_SERVICE_FEE_MAINNET_E2E_PROVIDER=<derived-provider-address> \
CONFIRM_SERVICE_FEE_MAINNET_E2E_EVALUATOR=<derived-evaluator-address> \
CONFIRM_SERVICE_FEE_MAINNET_E2E_AUTHORITY=SP28DBK3Q89F4KRYGPF51QT0RYEZBPXS4BAQ0ETBH \
CONFIRM_SERVICE_FEE_MAINNET_E2E_TREASURY=SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8 \
CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_TOP_UP_MICRO_STX=900000 \
CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_NETWORK_FEES_MICRO_STX=3500000 \
npm run e2e:autonomous:mainnet
```

Before opening signer files, the runner repeats the public release check, `security:gate` and the
full root test suite. The campaign manifest, both receipts and signer files must live in an
operator-owned private directory outside every Git work tree; signer files and existing artifacts
must be regular, non-symlink mode-`0600` files. It stops on pending nonces, insufficient balances or
any identity drift.

One fixed account lock covers STX and sBTC together. The client may make at most one exact,
deny-mode provider top-up when the STX-first precheck requires it. The independently typed
`900,000` micro-STX cap is aggregate for the complete two-asset campaign, not a per-asset allowance;
the coordinator carries the remainder into sBTC and records total use in the manifest. The separate
`3,500,000` micro-STX network-fee confirmation covers at most 16 contract calls at `200,000` plus
two possible provider top-up transfers at `150,000`; both numbers are authorization ceilings, not
spend targets. The coordinator journals and enforces the actual aggregate. Provider
reserve is calculated from every remaining provider call. Evaluator and authority each need two
fixed `200,000`-micro-STX calls across the campaign plus a `300,000` post-campaign reserve, so their
initial minimum is `700,000`; the known `800,000` balance leaves `400,000`. Client and all actors are
re-read immediately before each new call. Other actors are never automatically funded.

The wrapper always executes STX first and sBTC second, stops immediately if STX fails and requires
distinct non-overwriting receipts. To investigate one asset without broadcasting, use
`e2e:autonomous:mainnet:asset` with `SERVICE_FEE_MAINNET_E2E_ACTION=preflight`; the guarded
per-asset execute entry point is an implementation primitive and is not the release procedure.

The meaningful fixed path is create, budget, fund, assign, submit, evaluator reject, provider
appeal and authority resolve approve. For STX the gross budget is 100,000 micro-STX; for sBTC it is
1,000 satoshis. Success requires one 98% recipient transfer, one 2% treasury transfer, exact gross
conservation, terminal completion, zero escrow, final reputation synchronization and two-block
canonical finality. Each asset uses a different non-overwriting receipt. These internal canaries
must be classified `internal-team-operated-not-m2-adoption`; they are not external adoption,
external revenue or an independent audit. Receipts include the txid, exact public intent fields,
signed-serialization SHA-256 and byte length, but never raw signed transaction bytes or keys. If a
broadcast is uncertain, reconcile that preserved txid and intent hash—never start a fresh run.

### Interrupted campaign recovery

Every signed intent is journaled before broadcast without retaining raw signed bytes. On an exact
resume, the runner reconstructs the transaction from the same signer, nonce, arguments, fee and
post-conditions, checks its txid and serialization hash against the receipt, and accepts it only if
Hiro reports the exact canonical successful intent. A missing or pending tx is reported for manual
reconciliation and is **never retransmitted automatically**. A receipt that has ever recorded a
failed check cannot later be relabeled `passed`; preserve it as evidence and start no replacement
campaign until an operator has reconciled the failure.

Before starting either child, the coordinator durably records that asset as `started`, together
with its exact receipt path, ordinal and remaining campaign caps. If that marker exists but its
receipt is missing, recovery stops for manual reconciliation; it never replaces the evidence or
starts another job. Each later step uses the receipt's canonical high-water mark. A stage already
recorded is reconciled against its exact transaction; a new stage re-reads job roles, state and
escrow and refuses to sign when the job expiry, review, appeal or resolution deadline has closed.
This prevents a delayed resume from knowingly spending gas on a transaction the contract must
reject.

A stopped execution deliberately preserves the global lock. After reconciling every receipt txid,
confirm that the recorded lock owner PID is no longer active, calculate the exact lock hash, and
resume only the same campaign paths and reviewed SHA:

```bash
LOCK=/private/tmp/nayori-service-fee-mainnet-SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.lock
shasum -a 256 "$LOCK"

STACKS_NETWORK=mainnet \
SERVICE_FEE_MAINNET_E2E_ACTION=execute \
SERVICE_FEE_MAINNET_E2E_RESUME=reconcile-existing-campaign \
SERVICE_FEE_MAINNET_E2E_CAMPAIGN_PATH=<same-absolute-campaign-json> \
CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_CAMPAIGN_PATH=<same-absolute-campaign-json> \
CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_GLOBAL_LOCK_PATH="$LOCK" \
CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_GLOBAL_LOCK_SHA256=<exact-printed-lock-sha256> \
SERVICE_FEE_MAINNET_E2E_STX_RESULT_PATH=<same-absolute-stx-receipt-json> \
SERVICE_FEE_MAINNET_E2E_SBTC_RESULT_PATH=<same-absolute-sbtc-receipt-json> \
<all-original-signer-paths-and-exact-confirmations> \
npm run e2e:autonomous:mainnet
```

If `$LOCK.executor` also exists, inspect its recorded PID and run
`shasum -a 256 "$LOCK.executor"`. A dead executor must add both exact confirmations to the command
above: `CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_PATH="$LOCK.executor"` and
`CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_SHA256=<exact-sha256>`. A live executor makes
takeover invalid; wait for it to close or reconcile its outcome. Omit both variables only when the
executor file does not exist.

Each asset child acquires a PID-bound executor lease before opening signer files and revalidates
both lock tokens plus the absence of a recovery guard immediately before every broadcast. Executor
acquisition and takeover use the same atomic recovery sidecar. Takeover rechecks the lock and lease
hashes/bindings under that guard, refuses either a live coordinator or a live executor, rotates the
global lock token and PID, and allows only one resume process to win.
Never delete a lock blindly, change receipt paths or start a second campaign to work around an
uncertain transaction.

After both asset receipts pass exact schema, classification, binding, hash and all-checks
validation, the coordinator first persists `transactions-complete`, then releases the lock, then
persists `passed`. A restart at `transactions-complete` only revalidates those immutable receipts
and finishes lock cleanup; it cannot broadcast another transaction.
