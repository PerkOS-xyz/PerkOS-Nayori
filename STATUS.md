# Nayori — PerkOS Stacks Agentic Commerce: Project Status

Last verified: 2026-09-03

## Current status

### Additive fee candidate — 2026-09-04

STX `agentic-commerce-v6` and sBTC `sbtc-commerce-v5` implement a fixed 2% earned service fee,
job-pinned treasury, evidence-backed waivers and treasury-funded refunds in simnet only.
The 86 focused cases and full 212-test suite pass locally; the static security gate passes.
See the [candidate reference](contracts/service-fees-README.md) for the policy and limitations.
No active contract, deployment configuration, SDK package or production default was changed.
Opt-in Web fee disclosures, wallet/job-scoped acceptance and matching unreleased SDK support
are under QA integration review. Docs distinguish quotes, charges, waivers and actual refunds.
No active selection or npm publication accompanies this integration. Custody selection,
evaluator configuration, aggregate revenue indexing and real QA E2E remain required before rollout.

### Deployed baseline (last verified 2026-09-03)

**Live on Stacks mainnet.**

- Production app: [nayori.ai](https://nayori.ai)
- Developer portal: [docs.nayori.ai](https://docs.nayori.ai), an independent application with
  self-hosted search, generated OpenAPI reference and complete SDK/commerce onboarding.
- Partner API: [api.nayori.ai](https://api.nayori.ai) (invite-only; OAuth enrollment network migration pending)
- Public mainnet x402 resource: [nayori.ai/api/v1](https://nayori.ai/api/v1); the confirmed
  testnet proof remains reproducible release evidence.
- Public MPP PaymentAuth USDCx resource:
  [nayori.ai/api/mpp/v1](https://nayori.ai/api/mpp/v1)
- Same-origin OpenAPI discovery: [nayori.ai/openapi.json](https://nayori.ai/openapi.json)
- Live isolated facilitator: [facilitator.nayori.ai](https://facilitator.nayori.ai)
- Public evidence: [nayori.ai/evidence](https://nayori.ai/evidence)
- PerkOS compatibility URL: [stacks.perkos.xyz](https://stacks.perkos.xyz)
- Deployer: `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH`
- Settlement assets: STX and canonical mainnet sBTC
- Contract sources: exact match with the reviewed repository sources
- Contract tests: 126 passing

### Direct-payment rollout verification

Platform 0.7.3 is deployed from `595e849d765d61953d38bd9861b8f6ce23cf449b`.
The production API/facilitator passed 36 public checks, including mainnet asset/recipient
validation, both Ed25519 quote signatures and preservation of QA/testnet challenges. This
rollout did not sign or broadcast a payment. Subsequently, payer-approved mainnet x402 and MPP
canaries completed on 2026-09-03: 0.004 STX at block 8911041 and 0.01 USDCx at block 8911047.
An independent 41-check postcheck verified canonical success, exact single transfers, signed receipts
and idempotent delivery. Both actors are internal, not external adoption or revenue.
Production OAuth has also moved to mainnet wallet claims and passed 19 controlled enrollment checks;
partner access remains invite-only. QA retains testnet identities and challenges.

The new direct-payment panel and `/api/payments.json` require the opt-in facilitator feed to be
enabled after QA merge/validation. The existing live escrow counters do not index these transfers.

### Active versioned escrow release

`reputation-registry-v3`, `agentic-commerce-v5` and `sbtc-commerce-v4` are the active mainnet
generation. The escrow contracts use a fixed 12 Bitcoin burn-block review window, evidence-backed
pending decisions, a 144-burn-block appeal window, human resolution, permissionless timeout
liveness and durable reputation retry. sBTC funding pins the exact canonical SIP-010 token.

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

### Mainnet autonomous evaluation release

`agentic-commerce-v5` and `sbtc-commerce-v4` are deployed and configured on mainnet. They add
decision-pending and disputed states, verifiable decision/explanation hashes, role-specific
appeals, a job-pinned human authority, permissionless unappealed finalization and a second
resolution-timeout liveness path. Mainnet is initialized once with the 144-burn-block policy.

Twenty focused contract tests cover authorization, exact boundaries, reversal, conservation,
token pinning, reputation retry and authority fallback. Mainnet deployment/configuration completed
with seven successful transactions. Controlled STX and sBTC appeal reversals passed 47/47 and
50/50 checks, followed by a 75/75 signer-free public postcheck.

## Mainnet contracts

| Component | Contract |
| --- | --- |
| Agent identity | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.agent-registry` |
| Validation | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.validation-registry` |
| SIP-010 trait | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sip-010-trait` |
| Reputation | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.reputation-registry-v3` |
| STX escrow | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.agentic-commerce-v5` |
| sBTC escrow | `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce-v4` |

The prior v2/v2 generation remains immutable M1 evidence but is not the default for new jobs.

## Verified wiring

- `sbtc-commerce-v4` accepts only canonical mainnet sBTC:
  `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`.
- `agentic-commerce-v5` and `sbtc-commerce-v4` are authorized callers of
  `reputation-registry-v3`.
- The four stateful contracts that expose `get-owner` are owned by the mainnet deployer.
- Production build defaults explicitly select mainnet, the deployer address and the v5/v4/v3
  generation; the previous VPS image and existing Vercel deployment remain rollback paths.
- The public API validates wallet-linked OAuth tokens issued independently by `oauth.nayori.ai`,
  plus short-lived scopes, MCP, quotes,
  payment verification, one network-pinned broadcast, confirmation reconciliation and a delivery
  ledger for STX, sBTC and USDCx. Mainnet settlement requires an explicit runtime acknowledgement;
  fee sponsorship remains disabled.
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
  `@perkos/agent-sdk@0.7.1` package, signer adapters, testnet lifecycle, x402 v2 foundation and MPP
  PaymentAuth USDCx profile are available.
- The invite-only API adds wallet-linked OAuth and authenticated MCP to the mainnet confirmation
  and delivery-ledger path. OAuth authorizes API access but cannot sign a payment.
- The live x402 route issues mainnet challenges. The distinct live MPP `usdc/charge/stacks` route
  accepts canonical mainnet USDCx without changing escrow contracts; controlled testnet economic
  proofs remain internal release evidence rather than adoption or revenue.
- The current production agent-readiness score is **100/100, Level 5 (Agent-Native)**. DNSSEC,
  DNS-AID, external OAuth, MCP, agent discovery and x402 are live; MPP is an interoperability and
  revenue expansion rather than a score workaround.
- Remaining Milestone 2 acceptance work includes the external security review, recorded SDK demo
  and the required mainnet/non-team adoption evidence.
- The canonical public transparency surface is `/evidence`; legacy analytics, activity, stats and
  dashboard routes remain available for compatibility.

## Next product work

1. Validate and activate the separate public direct-payment evidence feed through QA, then production.
2. Complete the independent external review against the frozen source anchors and resolve or
   formally mitigate every Critical/High finding before broad public onboarding.
3. Complete the recorded SDK demo and mainnet/non-team adoption requirements for M2.
4. Invite external partners through wallet-linked OAuth and record only explicitly attested usage.
5. Add operational alerts for failed Chainhook delivery and unusual escrow activity.
