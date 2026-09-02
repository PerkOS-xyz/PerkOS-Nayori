# Nayori — PerkOS Stacks Agentic Commerce: Project Status

Last verified: 2026-08-31

## Current status

**Live on Stacks mainnet.**

- Production app: [nayori.ai](https://nayori.ai)
- Developer portal: [docs.nayori.ai](https://docs.nayori.ai), an independent application with
  self-hosted search, generated OpenAPI reference and complete SDK/commerce onboarding.
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
- Contract tests: 120 passing (100 existing regressions plus 20 autonomous-evaluator/appeal tests)

### Active versioned escrow release

`reputation-registry-v3`, `agentic-commerce-v4` and `sbtc-commerce-v3` are the active mainnet
generation. The escrow contracts use a fixed 12 Bitcoin burn-block review window, terminal timeout
payout, durable reputation retry and two-step ownership. sBTC funding pins the exact SIP-010 token
to each job.

The generation first passed on Stacks testnet under
`ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5`: controlled complete paths pass 27/27 for STX and
30/30 for sBTC. The real-timeout sBTC job `u2` passed preparation 20/20, settlement 12/12 and
separate public-state verification 10/10. It settled after the deadline at burn `11290` in tx
`0x06537111ef6c75d3c5d750154f97a3b4a0c233a84639583f7af18b2386915bb9`, block `214365`, with
terminal state `u6`, zero escrow, one exact 1,000-atomic-unit sBTC payout and no completion,
reputation or rating credit. The public evidence is in `docs/TESTNET_SECURITY_EVIDENCE.md`.

The frozen sources were promoted to mainnet from exact merge `670d23a`; deployment and wiring
confirmed in blocks 8885885–8885898. Exact merge `8782e54` then passed the security gate, 100/100
tests and signer-free preflight before a guarded internal 100-atomic-sBTC job passed 26/26. Job
`u1` is completed (`u3`), escrow is zero, payout is exact, reputation synchronization succeeded
and the client rating is persisted. A later signer-free read independently reconfirmed the final
state. Team-operated deployment/smoke actors are not M2 adoption, non-team wallets or revenue.

The release preserves evaluator authority through the exact deadline, permissionless provider
payout after the deadline, a non-completion `u6` timeout state, durable retryable reputation
synchronization, protocol/job namespacing, sBTC token pinning per funded job and two-step ownership
transfer. Web settlement reads the live escrow and job-pinned sBTC token before opening the wallet,
while zero-balance open expiry uses no transfer post-condition. The earlier immutable v3/v2
testnet generation and the prior mainnet generation remain historical evidence.

### Non-deployed autonomous evaluation candidate

`agentic-commerce-v5` and `sbtc-commerce-v4` are implemented locally and remain review-only. They
add decision-pending and disputed states, verifiable decision/explanation hashes, role-specific
appeals, a job-pinned human authority, permissionless unappealed finalization and a second
resolution-timeout liveness path. The same source accepts only a 3-burn-block QA policy or a
144-burn-block mainnet policy at one-time initialization.

Twenty focused tests cover authorization, exact boundaries, approval/rejection reversal,
single-settlement conservation, STX and sBTC payouts, per-job token pinning, token-confusion
rejection, reputation retry and unavailable-authority fallback. No current mainnet contract,
production consumer, deployment script or environment selection changed in this candidate.

## Mainnet contracts

| Component | Contract |
| --- | --- |
| Agent identity | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.agent-registry` |
| Validation | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.validation-registry` |
| SIP-010 trait | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sip-010-trait` |
| Reputation | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.reputation-registry-v3` |
| STX escrow | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.agentic-commerce-v4` |
| sBTC escrow | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce-v3` |

The prior v2/v2 generation remains immutable M1 evidence but is not the default for new jobs.

## Verified wiring

- `sbtc-commerce-v3` accepts only canonical mainnet sBTC:
  `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`.
- `agentic-commerce-v4` and `sbtc-commerce-v3` are authorized callers of
  `reputation-registry-v3`.
- The four stateful contracts that expose `get-owner` are owned by the mainnet deployer.
- Production build configuration explicitly selects mainnet, the deployer address and the
  versioned v4/v3/v3 generation; the existing Vercel deployment remains a rollback path.
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
- The apex `/openapi.json` view normalizes the one live USDCx offer to Payment Discovery's
  equivalent single-offer shorthand. The canonical API schema retains the preferred `offers[]`
  form, and the runtime 402 challenge remains authoritative.
- Chrome smoke testing loaded the existing sBTC job and the empty STX job list from chain.
- The web release publishes an RFC 9727 API Catalog, ARD manifests, Agent Skills v0.2.0,
  content-usage signals, discovery `Link` headers and three read-only WebMCP tools. The tools do not
  access wallets or expose state-changing actions.
- The public transparency dashboard and versioned JSON snapshot read agent, job and transaction
  totals from the canonical mainnet contracts. They preserve the approved 10,000-sat M1 lifecycle
  as an explicit baseline and keep team-operated wallets out of M2 external-adoption counters.

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

- Milestone 1 is approved and complete. Its contracts and transaction evidence remain unchanged;
  the active generation is documented as a later security and liveness improvement.
- Milestone 2 is in progress in the independent `PerkOS-Nayori-Agent-SDK` repository. The public
  `@perkos/agent-sdk@0.5.1` package, signer adapters, testnet lifecycle, x402 v2 foundation and MPP
  PaymentAuth USDCx profile are available.
- The invite-only API adds wallet-linked OAuth and authenticated MCP to the testnet confirmation
  and delivery-ledger path. OAuth authorizes API access but cannot sign a payment.
- The live x402 route supports the confirmed STX testnet proof. The distinct live MPP
  `usdc/charge/stacks` route accepts USDCx without changing escrow contracts; its controlled
  economic proof is complete and remains internal release evidence rather than adoption/revenue.
- The current production agent-readiness score is **100/100, Level 5 (Agent-Native)**. DNSSEC,
  DNS-AID, external OAuth, MCP, agent discovery and x402 are live; MPP is an interoperability and
  revenue expansion rather than a score workaround.
- Remaining Milestone 2 acceptance work includes the external security review, recorded SDK demo
  and the required mainnet/non-team adoption evidence.
- The canonical public transparency surface is `/evidence`; legacy analytics, activity, stats and
  dashboard routes remain available for compatibility.

## Next product work

1. Review and merge the autonomous-evaluator contract candidate; do not deploy it yet.
2. Implement the SDK, Web and dedicated evaluator service against the merged candidate in the
   fully isolated QA environment.
3. Complete full-role STX and official sBTC testnet E2E evidence before any mainnet rollout.
4. Complete the independent external review against the frozen source anchors and resolve or
   formally mitigate every Critical/High finding before broad public onboarding.
5. Complete the recorded SDK demo and mainnet/non-team adoption requirements for M2.
6. Invite external partners through wallet-linked OAuth and record only explicitly attested usage.
7. Add operational alerts for failed Chainhook delivery and unusual escrow activity.
8. Complete a controlled Leather USDCx testnet lifecycle before inviting external developers.
