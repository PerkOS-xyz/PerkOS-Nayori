# PerkOS Stacks Agentic Commerce — Project Status

Last verified: 2026-08-28

## Current status

**Live on Stacks mainnet.**

- Production app: [nayori.ai](https://nayori.ai)
- Partner API: [api.nayori.ai](https://api.nayori.ai) (invite-only testnet settlement)
- Public x402 resource and confirmed testnet proof: [nayori.ai/api/v1](https://nayori.ai/api/v1)
- Public MPP PaymentAuth USDCx resource:
  [nayori.ai/api/mpp/v1](https://nayori.ai/api/mpp/v1)
- Same-origin OpenAPI discovery: [nayori.ai/openapi.json](https://nayori.ai/openapi.json)
- Live isolated facilitator: [facilitator.nayori.ai](https://facilitator.nayori.ai)
- Public evidence: [nayori.ai/evidence](https://nayori.ai/evidence)
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
- The public API validates wallet-linked OAuth tokens issued independently by `oauth.nayori.ai`,
  plus short-lived scopes, MCP, quotes,
  payment verification, one testnet broadcast, confirmation reconciliation and a delivery ledger
  for STX, sBTC and USDCx. Mainnet facilitator settlement and fee sponsorship remain disabled.
- The web exposes a credential-stripping same-origin `/api/v1` route. It forwards only x402
  protocol headers to `api.nayori.ai/v1`; the API uses a merchant credential over HTTPS to the
  isolated facilitator. A payment returns 202 until confirmation and the fixed capability report
  is delivered only with `PAYMENT-RESPONSE` after the signed receipt exists.
- The separate `/api/mpp/v1` route forwards only `Payment-Authorization`,
  `X-NAYORI-SIGNED-QUOTE`, `Accept` and a request ID. It never forwards cookies or ordinary
  `Authorization`; the API returns `Payment-Receipt` only after confirmed USDCx settlement and
  idempotent delivery.
- Chrome smoke testing loaded the existing sBTC job and the empty STX job list from chain.
- The web release publishes an RFC 9727 API Catalog, ARD manifests, Agent Skills v0.2.0,
  content-usage signals, discovery `Link` headers and three read-only WebMCP tools. The tools do not
  access wallets or expose state-changing actions.
- The public evidence manifest records the approved 10,000-sat M1 lifecycle while keeping all
  team-operated wallets out of M2 external-adoption counters.

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
- Standards-based discovery for HTTP clients and browser agents

## Milestone status

- Milestone 1 is approved and complete. The current STX and sBTC contracts remain unchanged.
- Milestone 2 is in progress in the independent `PerkOS-Nayori-Agent-SDK` repository. The public
  `@perkos/agent-sdk@0.5.0` package, signer adapters, testnet lifecycle, x402 v2 foundation and MPP
  PaymentAuth USDCx profile are available.
- The invite-only API adds wallet-linked OAuth and authenticated MCP to the testnet confirmation
  and delivery-ledger path. OAuth authorizes API access but cannot sign a payment.
- The live x402 route supports the confirmed STX testnet proof. The distinct live MPP
  `usdc/charge/stacks` route accepts USDCx without changing M1 contracts; its controlled Leather
  economic proof remains pending testnet USDCx funding.
- The current production agent-readiness score is **100/100, Level 5 (Agent-Native)**. DNSSEC,
  DNS-AID, external OAuth, MCP, agent discovery and x402 are live; MPP is an interoperability and
  revenue expansion rather than a score workaround.
- Remaining Milestone 2 acceptance work includes the external security review, recorded SDK demo
  and the required mainnet/non-team adoption evidence.

## Next product work

1. Complete the external review, recorded SDK demo and mainnet/non-team adoption requirements for M2.
2. Invite external partners through wallet-linked OAuth and record only explicitly attested usage.
3. Add operational alerts for failed Chainhook delivery and unusual escrow activity.
4. Complete a controlled Leather USDCx testnet lifecycle before inviting external developers.
