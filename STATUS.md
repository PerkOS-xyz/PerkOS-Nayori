# PerkOS Stacks Agentic Commerce — Project Status

Last verified: 2026-08-26

## Current status

**Live on Stacks mainnet.**

- Production app: [nayori.ai](https://nayori.ai)
- Quote API: [api.nayori.ai](https://api.nayori.ai) (testnet, quote-only)
- PerkOS compatibility URL: [stacks.perkos.xyz](https://stacks.perkos.xyz)
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
- Production hosting configuration explicitly selects mainnet, the deployer address and
  `agentic-commerce-v2`; the existing Vercel deployment remains available as a rollback path.
- The public API advertises Stacks testnet quote issuance for STX, sBTC and USDCx. Payment
  verification, transaction broadcasting, settlement and fee sponsorship remain disabled.
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

## Milestone status

- Milestone 1 is approved and complete. The current STX and sBTC contracts remain unchanged.
- Milestone 2 is in progress in the independent `PerkOS-Nayori-Agent-SDK` repository. The public
  `@perkos/agent-sdk@0.2.0` package, signer adapters, testnet lifecycle, x402 v2 foundation and
  request-bound STX/sBTC/USDCx verification profile are available.
- The public quote-only API is live on testnet with machine-readable capabilities, OpenAPI and
  JWKS discovery. Its signed quotes are not proof of payment or settlement.
- Remaining Milestone 2 acceptance work includes the external security review, recorded SDK demo
  and the required mainnet/non-team adoption evidence.

## Next product work

1. Add payment verification, replay protection and settlement to the quote-only testnet API in
   reviewable stages without changing the approved escrow contracts.
2. Complete the external review, recorded SDK demo and mainnet adoption requirements for M2.
3. Add operational alerts for failed Chainhook delivery and unusual escrow activity.
