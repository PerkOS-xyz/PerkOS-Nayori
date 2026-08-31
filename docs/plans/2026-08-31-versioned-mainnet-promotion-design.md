# Versioned mainnet contract promotion

Date: 2026-08-31
Status: approved for phased implementation

## Decision

Promote the frozen 12-Bitcoin-block contract generation to Stacks mainnet as newly named,
immutable contracts. The release publishes `reputation-registry-v3`, `agentic-commerce-v4` and
`sbtc-commerce-v3` under the established Nayori deployer. The already deployed `sip-010-trait`
must match the reviewed local source exactly. Existing M1 contracts remain untouched as historical
evidence and as the production fallback until the new deployment passes independent on-chain
verification and a controlled smoke test.

The promotion is intentionally phased. Phase one deploys and configures the contracts without
changing Web, SDK, API or production runtime variables. Phase two verifies source hashes,
ownership, the 12-block review window, canonical mainnet sBTC, reputation caller authorization,
zero initial job counts and every transaction result. Phase three changes public configuration in
separate PRs and performs a minimal-value mainnet workflow. Until phase three succeeds, rollback
means retaining the current contract names in all public surfaces.

## Safety and failure handling

The dedicated promoter defaults to signer-free preflight. Deployment requires the literal mainnet
network, a release-specific typed confirmation and the exact expected deployer address. It verifies
hard-coded SHA-256 digests before reading credentials; rejects a dirty or mismatched source set;
refuses to proceed while the deployer has pending mempool transactions; checks balance, nonce and
maximum configured fees; uses deny-mode post-conditions; and submits one transaction at a time.

The workflow is source-aware and resumable. An existing contract is accepted only when its
on-chain source matches byte-for-byte after newline normalization. Every confirmed transaction
must have `tx_status=success` and an `(ok ...)` result. Configuration calls are idempotently skipped
when already correct. A secret-free receipt records hashes, public contract principals,
transaction IDs, block heights and final invariants outside version control. No private key,
mnemonic or signed transaction is written to the receipt.

This deployment is a security-driven pre-launch upgrade, not an assertion that the independent M2
security review is complete. The earlier contracts and M1 evidence remain permanently verifiable.
