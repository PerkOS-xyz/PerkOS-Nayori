# Contracts - PerkOS Stacks Agentic Commerce

Clarity smart contracts for PerkOS Stacks Agentic Commerce.

## Overview

Four core contracts providing agent identity, job escrow, reputation, and validation on Stacks.

## Versioned escrow security candidate — not deployed

The current mainnet contracts and historical evidence below remain authoritative. Three additional
contracts are present for local review and a controlled testnet release candidate:

| Candidate | Purpose |
| --- | --- |
| `reputation-registry-v3.clar` | Idempotent outcomes and ratings namespaced by protocol source and job ID |
| `agentic-commerce-v3.clar` | STX escrow with Bitcoin-height review liveness and durable reputation retry |
| `sbtc-commerce-v2.clar` | SIP-010 escrow with the same liveness controls and token pinning per funded job |

Submission records `submitted-at-burn` and `review-deadline = submitted-at-burn + 144`. The
evaluator remains authoritative while `burn-block-height <= review-deadline`. Only when
`burn-block-height > review-deadline` may any principal call `settle-review-timeout`, which pays
the provider and records terminal status `u6`. A timeout payout is deliberately excluded from
completed-job reputation and rating eligibility.

Settlement never depends on reputation availability. A failed outcome write is recorded in the
commerce contract and can be retried by any principal after the registry authorization is fixed.
Ownership changes use propose/accept, and sBTC jobs retain the token principal pinned at funding
even if the default token for future jobs changes.

The candidate has **no public-network address yet**. Run the full local suite with `npm test`. A
future testnet deployment must use the guarded, source-aware
`npm run deploy:versioned:testnet` command documented in `docs/DEPLOYMENT.md`; the script contains
no mainnet path.

## Contract Addresses

A Clarity contract's address is deterministic: `<deployer-principal>.<contract-name>`. The four
contracts deploy together — Clarinet resolves the `agentic-commerce → reputation-registry`
dependency (added so `complete-job`/`reject-job` can update reputation) automatically.

### Local (simnet / devnet) — live now

Deployer `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM` (mnemonic in `settings/Devnet.toml`):

| Contract | Address |
|----------|---------|
| agent-registry | `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.agent-registry` |
| agentic-commerce | `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.agentic-commerce` |
| reputation-registry | `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.reputation-registry` |
| validation-registry | `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.validation-registry` |

These resolve out of the box when running the test suite (`npm test`, in-process simnet).

### Testnet — deployed ✅

Deployer `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5` (PerkOS). All four contracts are live on the
Stacks testnet, and the commerce contract is registered as a reputation protocol-caller.

| Contract | Address | Deploy tx |
|----------|---------|-----------|
| agent-registry | `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.agent-registry` | [`b11abfdc…`](https://explorer.hiro.so/txid/b11abfdc9a06cb01d3409c27c0f7a406fee9b2afa68945a1f58b1acb872c3c64?chain=testnet) |
| reputation-registry | `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.reputation-registry` | [`3932f694…`](https://explorer.hiro.so/txid/3932f6943ded787cde887406b7e567d31d3eb95442b3e9cb56cceb541e7d9015?chain=testnet) |
| validation-registry | `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.validation-registry` | [`3987a532…`](https://explorer.hiro.so/txid/3987a532e3422cc48d5b335672b7c5d26e285e724d907537fded8c4b5850a225?chain=testnet) |
| agentic-commerce | `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.agentic-commerce` | [`5421781a…`](https://explorer.hiro.so/txid/5421781a5e66d00898c9390ed6d3371fe5b0b41f7841cd7674ecd1e929f45df9?chain=testnet) |

Reputation protocol-caller wiring: [`0118385d…`](https://explorer.hiro.so/txid/0118385d9034fc852a6337d9eb521bd71121d84181f44d3634e534b073f07dad?chain=testnet)

Deployed with [`scripts/deploy-testnet.mjs`](../scripts/deploy-testnet.mjs) (Stacks.js, reads the
gitignored `.env`).

### Mainnet — deployed ✅

Deployer `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH` (PerkOS wallet). All four contracts are live on
Stacks mainnet; the commerce contract is registered as a reputation protocol-caller.

| Contract | Address | Deploy tx |
|----------|---------|-----------|
| agent-registry | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.agent-registry` | [`7bb6aa75…`](https://explorer.hiro.so/txid/7bb6aa75310374e685601ccd759a2638b92ca1e1c229d8a0d8c496a65f894bb0?chain=mainnet) |
| reputation-registry | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.reputation-registry` | [`15e652b1…`](https://explorer.hiro.so/txid/15e652b1fe65027941ab4886c97f8a44107dfcd1f297c46d00929caf1161a966?chain=mainnet) |
| validation-registry | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.validation-registry` | [`6dbfb4da…`](https://explorer.hiro.so/txid/6dbfb4da10acf9ef8caf94d356cce60e7a40c3abbf19f02014b1ee7b11129949?chain=mainnet) |
| agentic-commerce | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.agentic-commerce` | [`1f1cbe7d…`](https://explorer.hiro.so/txid/1f1cbe7df381edd10d33b5e6aac7f94a0eec08a87b43daf2774da940d2660731?chain=mainnet) |

Reputation protocol-caller wiring: [`50dde25f…`](https://explorer.hiro.so/txid/50dde25f679d657555888b075d6d72b24b9c710e4dc5197700fe38f02bbdb316?chain=mainnet)

Deployed with [`scripts/deploy-mainnet.mjs`](../scripts/deploy-mainnet.mjs). The deployer is the
PerkOS wallet, so it is also the contract owner (no handoff needed).

## sBTC escrow (Milestone 1)

`sbtc-commerce.clar` is the sBTC-denominated successor to `agentic-commerce.clar`. Jobs are escrowed
and settled in sBTC (SIP-010, 8 decimals, sats) instead of STX, so payouts are Bitcoin-denominated.

It ships with hardening over the STX version:

| Change | Why |
|---|---|
| Only the evaluator may `reject-job` | In the STX version a client could reject delivered work and reclaim the escrow. A client also can no longer name themselves evaluator. |
| `rate-provider` is gated to the client or evaluator of a COMPLETED job, once per job | Ratings could previously be submitted by any wallet for any agent, making reputation farmable. |
| `submit-work` / `complete-job` refuse expired jobs | Removes the race between settlement and the expiry refund. |
| Reputation updates are non-blocking | A reputation failure can never trap escrowed funds. |
| `print` event on every transition | Makes indexing (Chainhooks, stats) reliable. |
| `average-score-x100` in reputation v2 | Integer division previously truncated 4.5 to 4. |

Escrow currency is not hardcoded: `set-payment-token` (owner only) points the contract at the
canonical sBTC contract for the network, and every escrow call validates the token against it.

- mainnet sBTC: `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`
- PoX-5 testnet sBTC: `SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token`

`mock-sbtc-token.clar` exists only for simnet tests and is never deployed to a public network.

### sBTC stack on mainnet — deployed ✅

Deployer `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH` (PerkOS wallet), which is also the contract owner.

| Contract | Address | Deploy tx |
|----------|---------|-----------|
| sip-010-trait | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sip-010-trait` | [`89a4a24a…`](https://explorer.hiro.so/txid/89a4a24a03805b12e6f710675b4cdc75201c227213a94a42eeb18712b1e048b9?chain=mainnet) |
| reputation-registry-v2 | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.reputation-registry-v2` | [`b08b1ece…`](https://explorer.hiro.so/txid/b08b1ecee6dfe66e66d6ae4886fbc639aae4b994361fc7eca27218a22c00d9b6?chain=mainnet) |
| sbtc-commerce | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce` | [`eada97f5…`](https://explorer.hiro.so/txid/eada97f5acc6787fdf7e9a7fe2205d3d803f47b987e2107bdb6af487a987d17c?chain=mainnet) |

Post-deploy wiring, both confirmed on mainnet:

| Step | Transaction |
|---|---|
| `set-payment-token` to canonical sBTC | [`a7d5f0a6…`](https://explorer.hiro.so/txid/a7d5f0a637d0cfb7add9d8928d971acebfb7636e5f3c2074a6ab3d559ca11f9f?chain=mainnet) |
| `add-protocol-caller` for the escrow | [`d752c14a…`](https://explorer.hiro.so/txid/d752c14a072dac33486c9ab4b2d7b5900f94b1c3db01362252351eb98f958299?chain=mainnet) |

Verified on-chain: `get-payment-token` returns `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`
and `is-registered-caller` returns true for `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce`.

Deploy with [`scripts/deploy-sbtc-mainnet.mjs`](../scripts/deploy-sbtc-mainnet.mjs).

### End-to-end sBTC job on mainnet — verified ✅

A complete agent job was funded, escrowed, delivered, settled and rated in **sBTC on Stacks
mainnet**, produced by [`scripts/e2e-sbtc-mainnet.mjs`](../scripts/e2e-sbtc-mainnet.mjs).
All 15 assertions passed.

- Job id `1` on `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce`, final status **COMPLETED (u3)**
- Budget **10,000 sats** (0.0001 sBTC) of canonical sBTC
- Provider `SP3DQCVZ26XCDGZFYB4TXJC6TMMZAVXZTER1DP8HV` received exactly 10,000 sats
- Evaluator `SP1VY24ADP27HERH4XMQTK44XB9QX4ZASPMPJKPVF` settled the job
- Reputation after settlement: `completed-jobs = 1`, `average-score-x100 = 500` (5.00)

| Step | Transaction |
|---|---|
| create-job | [`1319fcf7…`](https://explorer.hiro.so/txid/1319fcf70575baa1f4beb273cd0ec7194df2668a6e5681ee61c2183b83d3a675?chain=mainnet) |
| set-budget | [`8be6bb39…`](https://explorer.hiro.so/txid/8be6bb3915d72bb2d74132a36b1b7b608fdac9326bb07da1fef91637db1661d0?chain=mainnet) |
| **fund-job** (10,000 sats escrowed) | [`af4129fe…`](https://explorer.hiro.so/txid/af4129fe46fc913fda7b9fa87543f05fc5f4430b9b5f26a46f9c3032ea0fcbd4?chain=mainnet) |
| assign-provider | [`0993f5bd…`](https://explorer.hiro.so/txid/0993f5bd4bb1524db673d42960560cf558ec9bef18ccdf78ff562aa7a2598ee2?chain=mainnet) |
| submit-work | [`ed2436fd…`](https://explorer.hiro.so/txid/ed2436fd7ed908b88ceafd3eefc79c875d4e45931382fa0eb94dffc7516e7720?chain=mainnet) |
| reject attempt by client, **refused with `u309`** | [`366df31a…`](https://explorer.hiro.so/txid/366df31af4f9cedc043ef381dacce91b10d8d955e74cc4e927e6e9c88cc85f2d?chain=mainnet) |
| **complete-job** (provider paid in sBTC) | [`f1a4fb78…`](https://explorer.hiro.so/txid/f1a4fb78182262fb68c706e66374827550701b6d5dbccdc607588b1f0c951539?chain=mainnet) |
| rate-provider | [`05aadbdb…`](https://explorer.hiro.so/txid/05aadbdb1dccf98c353bd7974a562b1ecf477e99639449f8f43b3d62d0259000?chain=mainnet) |

The reject attempt is deliberate evidence, not a failure: it demonstrates on mainnet that a client
cannot reclaim escrow after receiving the deliverable. The escrow balance was verified unchanged
immediately afterwards, and settlement then proceeded normally through the evaluator.

The provider and evaluator in this run are wallets created for the demonstration, which exercises the
full mechanism. Adoption by independent, non-team wallets is tracked separately.

### sBTC stack on testnet — deployed ✅

> Historical M1 evidence below predates the PoX-5 token migration. Its contracts and txids remain
> preserved, but the permissive deployment/E2E scripts are retired and must not be used for current
> testnet activity. The versioned candidate uses the official PoX-5 token through the guarded
> scripts documented in `docs/DEPLOYMENT.md`.

Deployer `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5`.

| Contract | Address | Deploy tx |
|----------|---------|-----------|
| sip-010-trait | `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.sip-010-trait` | [`46612ba9…`](https://explorer.hiro.so/txid/46612ba928ac5b8a7fa3348c1e31d083aa9d102f5926dfefadae3b37c78d050f?chain=testnet) |
| reputation-registry-v2 | `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.reputation-registry-v2` | [`7bccb143…`](https://explorer.hiro.so/txid/7bccb1437190194fbd55e04e98d302301966fe5a80b5e0d2a8fe8a5fa3d37c5b?chain=testnet) |
| sbtc-commerce | `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.sbtc-commerce` | [`51cead50…`](https://explorer.hiro.so/txid/51cead50d601d8d3d9c644fb960352633658feb2c837ecabe0f9fd8c076c7b15?chain=testnet) |

Deploy with [`scripts/deploy-sbtc-testnet.mjs`](../scripts/deploy-sbtc-testnet.mjs). Order matters:
`sbtc-commerce` statically references `.sip-010-trait` and `.reputation-registry-v2`.

### End-to-end sBTC job on testnet — verified ✅

[`scripts/e2e-sbtc-testnet.mjs`](../scripts/e2e-sbtc-testnet.mjs) plays a real job with real sBTC and
asserts 14 checks, all passing: escrow funded, provider paid, reputation updated at settlement,
rating recorded, and a client reject correctly refused with `u309`.

| Step | Transaction |
|---|---|
| create-job | [`59e1092c…`](https://explorer.hiro.so/txid/59e1092ce90924fe7cade576b06d510e31bf360645c4ed425c80bd991f4f0336?chain=testnet) |
| fund-job (sBTC escrowed) | [`ad57d85b…`](https://explorer.hiro.so/txid/ad57d85b7c65d1a2e748a93157bbf71fca90eb72f4d22b31a243046b5a001ece?chain=testnet) |
| submit-work | [`c8f1638e…`](https://explorer.hiro.so/txid/c8f1638e07fe2f3e4a0b1e36d58d65cbcabe0b7655b5c00418a639af7c86fe87?chain=testnet) |
| reject by client (refused, `u309`) | [`97e2eb44…`](https://explorer.hiro.so/txid/97e2eb4499c3119d468f610e5bf8759af41556464a2d59849b5025f2148757cf?chain=testnet) |
| complete-job (sBTC paid out) | [`a12afd54…`](https://explorer.hiro.so/txid/a12afd54d1f39b6e689efcd6ff217d9cfa560e11346dc843b01bebac4511a8c2?chain=testnet) |
| rate-provider | [`6a8c2c26…`](https://explorer.hiro.so/txid/6a8c2c26017a8db2dfc357bfc836bf54260ad28b6b1b671c6764899dfb19206d?chain=testnet) |

### Post-deploy wiring for the sBTC stack

```clarity
;; 1. point the escrow at the canonical sBTC token for this network
(contract-call? .sbtc-commerce set-payment-token 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
;; 2. let the escrow write reputation at settlement
(contract-call? .reputation-registry-v2 add-protocol-caller '<deployer>.sbtc-commerce)
```

### Required post-deploy step

`complete-job` / `reject-job` call `reputation-registry.update-job-stats` as the contract, which is
protocol-gated. After deploying, whitelist the commerce contract once:

```clarity
(contract-call? .reputation-registry add-protocol-caller '<deployer>.agentic-commerce)
```

### Frontend wiring

Point the app at the deployed deployer:

```bash
NEXT_PUBLIC_CONTRACT_ADDRESS=<deployer-principal>
NEXT_PUBLIC_STACKS_NETWORK=testnet   # or mainnet
```

## Contracts

### agent-registry.clar

Manages on-chain identity for AI agents.

**Functions:**

```clarity
;; Register new agent
(define-public (register-agent
  (name (string-ascii 64))
  (description (string-ascii 256))
  (wallet principal)
  (endpoints (list 10 {name: (string-ascii 32), url: (string-ascii 128)}))
))

;; Get agent by ID
(define-read-only (get-agent (agent-id uint)))

;; Update agent metadata
(define-public (update-agent
  (agent-id uint)
  (new-name (optional (string-ascii 64)))
  (new-description (optional (string-ascii 256)))
  (new-wallet (optional principal))
))

;; Deactivate agent
(define-public (deactivate-agent (agent-id uint)))
```

**Data:**

```clarity
(define-map agents uint {
  name: (string-ascii 64),
  description: (string-ascii 256),
  wallet: principal,
  endpoints: (list 10 {name: (string-ascii 32), url: (string-ascii 128)}),
  creator: principal,
  active: bool,
  created-at: uint,
  updated-at: uint
})
```

### agentic-commerce.clar

Job escrow with STX payments.

**Functions:**

```clarity
;; Create job
(define-public (create-job
  (provider (optional principal))
  (evaluator principal)
  (expired-at uint)
  (description (string-ascii 512))
))

;; Set budget
(define-public (set-budget (job-id uint) (amount uint)))

;; Fund job (STX to escrow)
(define-public (fund-job (job-id uint)))

;; Assign provider
(define-public (assign-provider (job-id uint) (provider principal)))

;; Submit work
(define-public (submit-work (job-id uint) (deliverable (buff 64))))

;; Complete job (release escrow)
(define-public (complete-job (job-id uint)))

;; Reject job (refund client)
(define-public (reject-job (job-id uint)))

;; Expire job (auto-refund)
(define-public (expire-job (job-id uint)))
```

**Status Codes:**

| Status | Value | Description |
|--------|-------|-------------|
| Open | 0 | Job created, not funded |
| Funded | 1 | Escrow has STX |
| Submitted | 2 | Provider submitted work |
| Completed | 3 | Evaluator approved |
| Rejected | 4 | Evaluator rejected |
| Expired | 5 | Past expiration block |

### reputation-registry.clar

Agent rating and reputation tracking.

**Functions:**

```clarity
;; Rate agent (1-5)
(define-public (rate-agent
  (agent principal)
  (score uint)
  (job-id uint)
  (comment (string-ascii 256))
))

;; Get reputation
(define-read-only (get-reputation (agent principal)))
```

**Data:**

```clarity
(define-map reputations principal {
  total-score: uint,
  rating-count: uint,
  average-score: uint,
  completed-jobs: uint,
  disputed-jobs: uint
})
```

### validation-registry.clar

Agent verification and capabilities.

**Functions:**

```clarity
;; Verify agent (protocol-caller only)
(define-public (verify-agent
  (agent principal)
  (proof-hash (buff 32))
  (capabilities (list 10 (string-ascii 32)))
))

;; Revoke verification
(define-public (revoke-verification (agent principal)))

;; Add capability
(define-public (add-capability (agent principal) (capability (string-ascii 32))))

;; Remove capability
(define-public (remove-capability (agent principal) (capability (string-ascii 32))))

;; Get verification
(define-read-only (get-verification (agent principal)))
```

## Development

### Validate

```bash
clarinet check
```

### Test

```bash
clarinet test
```

### Generate Deployment Plan

```bash
clarinet deployments generate --testnet --low-cost
```

### Deploy

```bash
clarinet deployments apply --testnet
```

## Access Control

- **Owner**: Can upgrade implementation
- **Protocol Caller**: Can modify state (reputation, validation)
- **Job Roles**: Client, provider, evaluator each have specific permissions

## Security

- Owner-only upgrades
- Protocol caller validation
- Status checks on transitions
- Principal verification
- Escrow balance tracking
- Refund on failure

## License

MIT
