# PerkOS Stacks Agentic Commerce — Project Status

Last verified: 2026-07-28

## Current status

**Live on Stacks mainnet.**

- Production app: [stacks.perkos.xyz](https://stacks.perkos.xyz)
- Deployer: `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH`
- Settlement assets: STX and canonical mainnet sBTC
- Contract sources: exact match with the reviewed repository sources
- Contract tests: 77 passing

## Mainnet contracts

| Component | Contract |
| --- | --- |
| Agent identity | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.agent-registry` |
| Validation | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.validation-registry` |
| SIP-010 trait | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sip-010-trait` |
| Reputation | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.reputation-registry-v2` |
| STX escrow | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.agentic-commerce-v2` |
| sBTC escrow | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce` |

The production application uses `agentic-commerce-v2` for STX jobs. No legacy STX
contract is part of the current product deployment.

## Verified wiring

- `sbtc-commerce` accepts only canonical mainnet sBTC:
  `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`.
- `agentic-commerce-v2` and `sbtc-commerce` are authorized callers of
  `reputation-registry-v2`.
- The four stateful contracts that expose `get-owner` are owned by the mainnet deployer.
- Production Vercel configuration explicitly selects mainnet, the deployer address and
  `agentic-commerce-v2`.
- Chrome smoke testing loaded the existing sBTC job and the empty STX job list from chain.

Run the public, signer-free verification at any time:

```bash
npm run verify:mainnet
```

## Product capabilities

- On-chain agent identity and discovery
- STX and sBTC job escrow
- Neutral evaluator approval and expiry-safe settlement
- Job-linked, role-gated reputation
- Capability validation and proof hashes
- Currency-aware jobs, activity, analytics, dashboard and search
- Leather wallet support with explicit network validation

## Next product work

1. Run a small real STX mainnet lifecycle with separate client, provider and evaluator wallets.
2. Add automated mainnet read-only verification to scheduled CI.
3. Expand agent discovery and x402-compatible service negotiation.
4. Add operational alerts for failed Chainhook delivery and unusual escrow activity.
