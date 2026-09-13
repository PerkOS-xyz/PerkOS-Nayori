# Mainnet v6/v5 consumer promotion design

## Context and decision

The immutable `agentic-commerce-v6` and `sbtc-commerce-v5` sources are deployed and initialized
on Stacks mainnet under `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH`. Their reviewed policy is
12 Bitcoin burn blocks for evaluation, 144 for appeals, a 200-basis-point earned service fee,
the distinct treasury `SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8`, the distinct appeal authority
`SP28DBK3Q89F4KRYGPF51QT0RYEZBPXS4BAQ0ETBH`, and canonical PoX-5 sBTC. Deployment alone did not
change any consumer.

Three approaches were considered. A production-only fork would duplicate logic and create drift.
Runtime-only overrides would be insufficient because Next.js embeds public contract values during
the image build. A single network-aware codebase with exact, fail-closed defaults is therefore the
selected approach. Mainnet and current QA select v6/v5; explicit historical configuration can
still read immutable v5/v4 jobs. Legacy deploy and E2E runners remain reproducible under names that
identify their generation, but no generic command may imply that they operate the active release.

## Components and data flow

The Web build defaults, example environment, VPS QA controller, QA release schema and QA suite
select v6/v5 together. Capability detection continues to recognize older generations so historical
job URLs remain readable. Fee-aware reads must obtain protocol configuration and the per-job fee
ledger before allowing an economic action; an unavailable or inconsistent policy fails closed.

The signer-free mainnet verifier is the independent release oracle. It compares exact local and
on-chain source bytes and SHA-256 digests, verifies owners, canonical sBTC, reputation allowlists,
protocol initialization, 12/144 windows, the appeal authority, treasury and 200 basis points, then
reports agent and active-generation job counts. It never reads a signer or broadcasts a transaction.
Documentation and the developer portal describe v6/v5 as the production generation while keeping
dated v5/v4 records explicitly historical or superseded.

## Safety, errors and compatibility

Crossed network/address combinations remain rejected. Mainnet policy values are constants in the
verifier rather than operator-supplied defaults. Source mismatch, uninitialized policy, wrong role,
wrong token, missing allowlist entry or fee-policy drift terminates verification with a non-zero exit.
Existing v5/v4 contracts and jobs are neither modified nor hidden; consumers can select them only by
an explicit contract override. Historical source hashes, receipts, runbooks and test fixtures remain
unchanged and are labelled where necessary instead of rewritten.

The old autonomous mainnet deploy/E2E commands become generation-qualified `*:legacy-v5-v4:*`
aliases. This avoids an operator accidentally treating them as the current v6/v5 path while preserving
reproduction of prior evidence. The generic E2E alias instead invokes a new v6/v5 runner. Its default
preflight performs only public reads; the execution path requires an exact reviewed merge, a clean tree,
external mode-0600 signers, distinct role confirmations and a new non-overwriting external receipt. It
executes an immediate reject/appeal/approve lifecycle for either STX or canonical sBTC, constrains every
asset movement with deny-mode post-conditions, and proves gross = 98% recipient + 2% treasury, zero
escrow, one settlement and synchronized reputation. Actor addresses are derived from their keys and
must match typed confirmations, so the existing key-only actor file is supported without weakening the
identity binding. A single, exact provider gas top-up per asset is allowed only when needed, capped at 900,000
micro-STX, independently confirmed and journaled as its own canonical transaction. No deployment,
mainnet E2E or blockchain transaction is part of this consumer-promotion change. The generic
execution wrapper always runs STX first and sBTC second with distinct receipts and stops before
sBTC if STX does not pass. Receipts retain the txid, exact intent fields and SHA-256/length of the
signed serialization, never the raw signed transaction bytes.

## Verification and release

Tests assert v6/v5 Web defaults, historical override support, QA controller/schema/suite parity,
active verifier policy and absence of stale production-language in current public documentation.
Runner tests additionally bind the v6/v5 typed confirmation, source hashes, signer-read ordering,
external receipt, top-up cap and 98/2 conservation assertions.
The repository security gate continues protecting historical v5/v4 sources and runners, while its
active-consumer assertions move to v6/v5. Before review, run the root security gate and complete root,
Web and developer-portal test/build gates with the repository-supported Node runtime.

The feature branch targets protected `qa`. Because `qa` and `main` have diverged histories, the branch
must merge the current `origin/qa` without rebasing or force-pushing and resolve conflicts by retaining
the newer mainnet custody/deployment work plus this promotion. A later reviewed QA deployment and
controlled E2E are distinct operational gates before a production consumer rollout.
