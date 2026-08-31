# Mainnet sBTC v3 smoke test

Date: 2026-08-31
Status: approved as phase-two release verification

## Design

Run one minimal, team-operated `sbtc-commerce-v3` job on Stacks mainnet before changing public
Web, SDK or API defaults. The client is the established Nayori deployer; isolated provider and
evaluator identities are used so the contract's party-separation controls are exercised. The job
escrows exactly 100 atomic sBTC units, follows create, budget, fund, assign, submit, complete and
rate, and must finish at status `u3` with zero escrow, one exact provider payout, a durable
reputation outcome and one persisted rating. This internal smoke test is operational evidence only
and must never be counted as external M2 adoption, independent wallets or revenue.

A mainnet-specific runner remains separate from the testnet runner. It defaults to signer-free
preflight, pins the deployer, contract names, canonical sBTC and frozen source SHA-256 values, and
requires two release-specific confirmations before reading any secret. It refuses pending deployer
transactions, source drift, non-mainnet addresses, insufficient STX/sBTC and receipt or actor-key
paths inside the Git worktree. Every asset-moving call uses deny-mode exact post-conditions and
every transaction is confirmed before the next nonce is used.

Provider and evaluator keys are generated only after the execution gate and persisted with mode
`0600` in a required external recovery file. This prevents an interrupted run from stranding actor
funds while keeping all secrets out of Git and the public receipt. The receipt contains only public
principals, transaction IDs, blocks, source hashes, state transitions and final invariants. A
failed or interrupted run stops without changing production configuration; recovery uses the same
external actor file and on-chain receipt rather than generating replacement identities.

Only a fully passing receipt permits the subsequent activation PRs. Rollback before activation is
therefore unchanged: production consumers continue using the historical M1 contracts.
