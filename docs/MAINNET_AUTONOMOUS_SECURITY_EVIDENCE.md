# Nayori v5/v4 mainnet security evidence

This record freezes the public, reproducible evidence for the active Nayori autonomous escrow
generation on Stacks mainnet. It is intended to anchor the independent external security review.
It is not an audit report or a claim of external adoption.

## Scope

- Deployer: `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH`
- Reputation: `reputation-registry-v3`
- STX escrow: `agentic-commerce-v5`
- sBTC escrow: `sbtc-commerce-v4`
- Canonical sBTC: `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`
- Review window: 12 Bitcoin burn blocks
- Appeal window: 144 Bitcoin burn blocks
- Appeal authority: `SP28DBK3Q89F4KRYGPF51QT0RYEZBPXS4BAQ0ETBH`

## Frozen source digests

| Source | SHA-256 |
| --- | --- |
| `sip-010-trait.clar` | `a9e0b5050db87bff71bbe893b981425497c1a1d3191a9cc65e221c32a1a37b52` |
| `reputation-registry-v3.clar` | `05f5996c11d07f4f2ee91c2ff083e33b232e5b1a684a614712847837ea24074a` |
| `agentic-commerce-v5.clar` | `e5bf374aaf514903205a9f069a794a4c34eb0f1100fb144c13ccd397e80664e7` |
| `sbtc-commerce-v4.clar` | `4ab54889b8f08835f2942bd8f0b9add4d6950b0307bcbf6f8691c0a0b4d8debc` |

## Deployment and configuration

Every transaction confirmed with `success (ok true)`.

| Action | Block | Transaction |
| --- | ---: | --- |
| Deploy STX v5 | 8905872 | [`d69f0e08…ae7c`](https://explorer.hiro.so/txid/d69f0e0883a5c1f736553a32d860dfbbc64c554e8baed6b1ee66b42b4a09ae7c?chain=mainnet) |
| Deploy sBTC v4 | 8905874 | [`b1a11204…b25c`](https://explorer.hiro.so/txid/b1a112046d14342851b53918b97d1b00aa9bf0fc3d62c8d6c7fc578c757bb25c?chain=mainnet) |
| Initialize STX policy | 8905876 | [`85403f46…3bdf`](https://explorer.hiro.so/txid/85403f460e9e8b34182f461707e52ab5684333088ac1d02c39a7ede96ad03bdf?chain=mainnet) |
| Initialize sBTC policy | 8905879 | [`ab426457…5992`](https://explorer.hiro.so/txid/ab4264575c6a5f7e9b06cc3c0e0fcccfe61504fa5ed7771b0d3c948ddc5c5992?chain=mainnet) |
| Configure canonical sBTC | 8905881 | [`abce06f7…6190`](https://explorer.hiro.so/txid/abce06f754abc9a09d5bd73565404bfae99b06575ffc94d613c9e9fad6d46190?chain=mainnet) |
| Authorize STX reputation source | 8905884 | [`a3e00f41…b58a`](https://explorer.hiro.so/txid/a3e00f4164b2d61fcdc382f8d2fd37a20f72cd7790ee78e1649e62bddb18b58a?chain=mainnet) |
| Authorize sBTC reputation source | 8905886 | [`457deda9…b273`](https://explorer.hiro.so/txid/457deda9a6b9236e7de75cd670cf744bc9e9bd4302264d1a2fba29eb055cb273?chain=mainnet) |

The secret-free deployment receipt has SHA-256
`3827677a370aa11332de912cfceb8f503fbe7b5ce4a6d7430616adeb99cb4ba9`.

## Controlled mainnet canaries

Two internal team-operated canaries exercised distinct assets and opposite appeal directions.

| Asset and path | Result | Terminal transaction | Receipt SHA-256 |
| --- | --- | --- | --- |
| STX: approve → client appeal → authority reject | 47/47; `u4`; escrow zero; one exact 100,000-micro-STX refund; reputation synchronized | [`0x71a45abe…602f`](https://explorer.hiro.so/txid/0x71a45abef8cb32a23d5e0aaaddc41f93d5b49e4eb59a8a576950bddae026602f?chain=mainnet), block 8906033 | `5895e719008db0b9ad95c4dbc97910001441feffc1ad9a969f1337ee7a96a03d` |
| sBTC: reject → provider appeal → authority approve | 50/50; `u3`; escrow zero; one exact 100-satoshi payout; reputation synchronized | [`0x3780f584…dd82`](https://explorer.hiro.so/txid/0x3780f58452e15fff2d8f258b9a68b637f0e3432b999ceeb9d6e990864a9fdd82?chain=mainnet), block 8906060 | `208804e5820fb67b1dec2ad23eacc5f7e5d265ee62428da4c5b24d5e7e3942e7` |

An independent signer-free postcheck passed 75/75 checks over sources, policy, role separation,
transaction results, decision hashes, terminal states, zero escrow, reputation outcomes, exact
unique transfers and empty actor mempools. Its receipt SHA-256 is
`0fb7a542be827dfa68b49b7f6fac0b55ec8643f752a63bdefead2ca603c6b973`.

## Reproduce the public verification

No signer, private key or funded wallet is required:

```bash
npm ci
npm run security:gate
npm test
npm run verify:mainnet
```

The last verification passed the security gate, all 126 contract tests and every current mainnet
source/configuration check. The verifier reads v5/v4 job counts but does not mutate chain state.

## Classification and remaining review

The deployer, controlled provider, controlled evaluator and appeal authority are all internal
team-operated actors. These transactions prove operability only and must not be counted toward
external developer adoption, non-team wallet participation, grant usage thresholds or revenue.

The independent external security review remains open. Its final scope must include sBTC escrow,
access control, evaluator decisions, settlement conservation, appeal authorization, authority
rotation, timeout liveness and reputation synchronization. Until that report is complete, Nayori
must not describe this generation as externally audited.
