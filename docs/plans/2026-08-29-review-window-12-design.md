# Fixed 12-burn-block escrow review window

Date: 2026-08-29

Status: Approved for implementation; testnet review candidate only

## Decision

Create `agentic-commerce-v4` and `sbtc-commerce-v3` as immutable successors to the deployed
144-block testnet generation. Keep `reputation-registry-v3` and `sip-010-trait` unchanged. Set
`REVIEW_WINDOW_BURN_BLOCKS` to `u12` in both new escrow contracts.

Production contracts, application defaults and mainnet remain unchanged.

## Security invariants

The new generation changes only the fixed review-window constant and contract names. It preserves:

1. evaluator completion or rejection while `burn-block-height <= review-deadline`;
2. permissionless timeout payout only when `burn-block-height > review-deadline`;
3. exact deny-mode funding and settlement post-conditions;
4. `TIMEOUT_PAID u6` outside completion, rating eligibility and reputation success;
5. retryable reputation synchronization that cannot roll back economic settlement;
6. per-funded-job sBTC token pinning; and
7. two-step ownership transfer.

Tests must also assert that `agentic-commerce-v3` and `sbtc-commerce-v2` still expose `u144`.

## Rationale and sources

`burn-block-height` is the underlying burn-chain height, while Stacks tenure state is anchored to
Bitcoin at the following tenure boundary. The official sBTC withdrawal flow uses six Bitcoin
confirmations for its separate cross-chain operation. None of these sources impose a 144-block
application escrow policy:

- https://docs.stacks.co/reference/clarity/keywords
- https://docs.stacks.co/learn/block-production/bitcoin-finality
- https://docs.stacks.co/learn/sbtc/sbtc-operations/withdrawal

Twelve burn blocks is a Nayori product-policy choice: it gives an evaluator and operator recovery
margin while targeting approximately two hours of average provider lockup. Bitcoin block intervals
are variable, so the product must display the on-chain deadline rather than promise wall-clock
settlement.

## Release sequence

1. Merge the contracts/Web and SDK pull requests independently.
2. Pin both repositories to the exact merges and rerun all local gates.
3. Deploy only the new v4/v3 names to Stacks testnet using the guarded deployer.
4. Repeat STX completion, sBTC completion and a real 12-block timeout lifecycle.
5. Produce new secret-free receipts and an exact-hash audit manifest.
6. Obtain external review before any mainnet activation decision.

The historical 144-block job `u2` may complete independently as regression evidence. It must not
be altered, counted as external adoption or substituted for the new 12-block timeout evidence.
