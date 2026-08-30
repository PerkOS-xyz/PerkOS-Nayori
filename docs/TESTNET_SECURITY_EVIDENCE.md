# Versioned escrow testnet security evidence

Last verified: 2026-08-30

This record freezes the public, reproducible evidence for Nayori's 12-burn-block escrow candidate.
It is a testnet engineering record awaiting independent security review. It is **not** an audit
opinion, a mainnet release approval or external-adoption evidence.

## Exact source anchors

| Surface | Merge commit | Git tree |
| --- | --- | --- |
| Contracts and Web | `b15544d601bd4e49610be854f7ad33a0af90c0a7` | `eb1143f5f32c4377098ad7268bbfad0cb2cdb516` |
| Agent SDK | `50d58d55a255313915fcf4c2f025dd8ce15b4e1d` | `5bbd8749bf31a37a1a63cc063017726a9ff148c4` |

The contract merge passed `npm run security:gate`, 100/100 contract tests and a zero-known-
vulnerability dependency audit from a clean detached worktree. The SDK anchor passed 152/152
tests, typecheck and build.

### Reviewed source digests

| File | SHA-256 |
| --- | --- |
| `contracts/sip-010-trait.clar` | `a9e0b5050db87bff71bbe893b981425497c1a1d3191a9cc65e221c32a1a37b52` |
| `contracts/reputation-registry-v3.clar` | `05f5996c11d07f4f2ee91c2ff083e33b232e5b1a684a614712847837ea24074a` |
| `contracts/agentic-commerce-v4.clar` | `680491c2466bd3f614eda7fa3eba1a393202bb2736d673074e838b0eba11fc27` |
| `contracts/sbtc-commerce-v3.clar` | `dc46bf5dafbc73dea3e578786e10426d233c9338df68ef0265b5066cbad55cda` |
| `tests/versioned-escrow-liveness.test.ts` | `fd63b589f041c24022ccafd3a1f54eb92899dff25be805b44ce3c2dcf95e1e92` |
| `scripts/e2e-versioned-escrow-testnet.mjs` | `69d408a171428ccea017df8904910329834dd6a68011a41efc3f4c1b0b8a83be` |
| `scripts/security-gate.mjs` | `0cd7f354e11dfba7a629d2ee7c4dd3168124d54cd92c3ba904186fa480b77470` |
| `Clarinet.toml` | `cb135b78f00afcf43c49bfbd4acc73f8a9d20313f2e6813d78d71122b98cb4aa` |
| `package-lock.json` | `7957cb00f59612aa17a25afa27426c5da4a176fc89210748f993b3fc66d76c68` |

## Testnet deployment

- Deployer: `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5`
- STX escrow: `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.agentic-commerce-v4`
- sBTC escrow: `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.sbtc-commerce-v3`
- Reputation: `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.reputation-registry-v3`
- Official PoX-5 sBTC: `SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token`

| Operation | Transaction | Block | Result |
| --- | --- | ---: | --- |
| Deploy STX escrow | [`0xe487f4f5…dd9b8`](https://explorer.hiro.so/txid/0xe487f4f5c1478b271ec98084064e416418d3af4a17514de4a5488a9cf55dd9b8?chain=testnet) | 209312 | `success (ok true)` |
| Deploy sBTC escrow | [`0x1ec7fff7…db7a9`](https://explorer.hiro.so/txid/0x1ec7fff7bc754fdf33afb82593acc7d2feda30983967d4f1499d57b4890db7a9?chain=testnet) | 209314 | `success (ok true)` |
| Configure PoX-5 sBTC | [`0x4fa5569d…98c2a`](https://explorer.hiro.so/txid/0x4fa5569d2d94250731811ca2fff72ecfed29b4a535ef63f5114efb0f59e98c2a?chain=testnet) | 209316 | `success (ok true)` |
| Authorize STX escrow | [`0xabf7a0b0…cfce8`](https://explorer.hiro.so/txid/0xabf7a0b0483be31236c7a3e3bb2d65ff167a5171882039ce6de6664fb55cfce8?chain=testnet) | 209318 | `success (ok true)` |
| Authorize sBTC escrow | [`0x323a002c…17b6e`](https://explorer.hiro.so/txid/0x323a002c48e0a52473bf27c2c1df3aa1296fad5f5d82aa9bf12e8a91a8017b6e?chain=testnet) | 209320 | `success (ok true)` |

## Lifecycle results

| Scenario | Result | On-chain evidence |
| --- | --- | --- |
| STX completion | PASS 27/27 | Job `u1`; [completion](https://explorer.hiro.so/txid/0xa33fdffa7d5ac0bd4b60ba8bd51ef298e6f48930f703052d3967770faa0a8bf4?chain=testnet) at block 209347; [rating](https://explorer.hiro.so/txid/0xe442fed7d07d9c8480f8d0b6d1dfed04f31653785c292f14e1bad59f62259fd5?chain=testnet) at block 209348 |
| Official PoX-5 sBTC completion | PASS 30/30 | Job `u1`; [completion](https://explorer.hiro.so/txid/0x32ff6fb26a16ac52e9126dad9a5571d29e9b3e7c6fd436f90795308651c275f1?chain=testnet) at block 209368; [rating](https://explorer.hiro.so/txid/0x7136a9195e34951215fef70e2c7eccfecf679abe3710060e91cdf06d33a91413?chain=testnet) at block 209370 |
| Official PoX-5 sBTC timeout | PASS 20/20 preparation, 12/12 settlement, 10/10 public-state verification | Job `u2`; [settlement](https://explorer.hiro.so/txid/0x06537111ef6c75d3c5d750154f97a3b4a0c233a84639583f7af18b2386915bb9?chain=testnet) at block 214365 / burn 11290 |

The timeout job was submitted at burn `11091` with review deadline `11103`. Before settlement it
was `SUBMITTED (u2)` with exactly 1,000 atomic units in escrow. The confirmed transaction returned
`(ok true)`, moved exactly 1,000 units once to the assigned provider, and left the job
`TIMEOUT_PAID (u6)` with zero escrow. Public reads found no completion outcome or rating. A second
settlement was not broadcast; the terminal state prevents another payout.

## Receipt integrity

Secret-free raw receipts are retained outside the public repository for independent-review
handoff. Their published SHA-256 digests are:

| Receipt | Checks | SHA-256 |
| --- | --- | --- |
| Deployment | source/configuration | `5ebee1300718cd265ab9d6246a4030838c0c2447fcfdfdb071d0b2f5d7ec54ae` |
| STX completion | 27/27 | `a8efeeefe9e14a15d44bebd282070d9dd3fc5c12cbf3595db01bc300e266c2cc` |
| sBTC completion | 30/30 | `a489cdd9dc0aea7d94a394d99322e16bc875b6db73c2158e08a22686e4739f4c` |
| Timeout preparation | 20/20 | `00100b97ae3dd0c921b8e509c7a4c3315e43b826eaf3d30c88190ff6341a168c` |
| Timeout settlement | 12/12 | `413989cc456b7d6083bc1902560e0eba499b17500fd8a4a0176e55ce67321117` |
| Timeout public-state verification | 10/10 | `eaaa6f4d342f7be08bbdb5165858107fcf594194e25cf01f7b779fabd7d546cf` |

## Release boundary

- Mainnet contracts and application production defaults were not changed.
- No production rollout, npm publication or Docker build occurred for this evidence run.
- All participating testnet identities were controlled test identities and count as no external
  adoption.
- Independent external review and disposition of every Critical/High finding remain mandatory
  before any mainnet activation decision.
