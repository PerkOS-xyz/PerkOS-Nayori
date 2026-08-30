# PoX-5 sBTC testnet migration design

## Decision

Nayori will update only its active Stacks testnet configuration from the retired pre-PoX-5 sBTC
principal `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token` to the official PoX-5 testnet
principal `SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token`.

The Stacks Labs PoX-5 announcement identifies that exact token, and the authenticated Hiro Platform
faucet transferred it to Nayori's testnet deployer in transaction
`0x90996888f75472038047885b35775a3f6a32aa1d0648a7e9c84882d2140b7a41`. The transaction succeeded
at block 207783 and transferred 5,000,000 units. This direct observation supersedes older testnet
documentation while leaving mainnet unchanged.

## Boundaries

- Mainnet remains `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`.
- Historical M1 contracts, sources, addresses and evidence remain unchanged.
- The versioned candidate contracts are not redeployed. Their Clarity sources and review hashes
  remain identical.
- Only the owner-authorized `set-payment-token` value on the testnet `sbtc-commerce-v2` candidate
  changes. This value is the default for future funding; every already funded job retains its pinned
  token. There are no active external testnet escrows.
- Production and mainnet application variables remain unchanged.

## Implementation

The active versioned deployment verifier, versioned E2E runner, Web testnet constant and example
environment will use the PoX-5 principal. The deployment verifier remains idempotent: it verifies
the four exact contract sources and owners, reads the current token, sends one deny-mode
`set-payment-token` call only when needed, then verifies the final value and writes a receipt outside
Git.

The security gate will require the PoX-5 principal and reject the pre-PoX-5 principal in every
active testnet surface. The two historical M1 testnet scripts use permissive post-conditions and are
not valid migration tools; they will stop before reading credentials. Their old addresses and txids
remain in documentation solely as historical evidence.

## Validation and failure handling

Before any chain write, CI and local validation must pass the security gate, all 98 contract tests,
Web tests/lint/build and diff checks. After human merge, execution must use the exact merge commit,
explicit `STACKS_NETWORK=testnet` and typed deployment confirmation. The verifier fails closed on a
source mismatch, owner mismatch, unexpected token, network mismatch, signer mismatch or failed
transaction.

The sBTC E2E may run only after the administrative transaction confirms and the deployer balance is
observed under the PoX-5 asset identifier. It must use exact deny-mode FT post-conditions, verify
funding, token pinning, escrow, payout, reputation and rating, and store only public principals and
txids in the secret-free receipt. Team-operated testnet actors do not count as M2 adoption.

## Rejected alternatives

Changing on-chain state without updating code would create configuration drift and make the runner
fail unpredictably. Redeploying all candidate contracts would introduce unnecessary addresses and
review anchors even though token rotation is an explicit owner operation. Accepting an unofficial
look-alike token would invalidate the security evidence.
