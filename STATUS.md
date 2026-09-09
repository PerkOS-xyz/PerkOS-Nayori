# Nayori — PerkOS Stacks Agentic Commerce: Project Status

Last verified: 2026-09-09 UTC (QA timing rollout; not a new production verification)

## Current status

### SDK 0.8.0-rc.2 published — 2026-09-09 UTC

The reviewed rc.2 artifact is public on npm under next; latest remains 0.7.1. Registry SHA-512
and downloaded tarball SHA-256 match the tested VPS artifact. Publication was authorized from
the operator Mac without provenance attestation. It adds configurable policy for new version-2
testnet permits, not migration of existing runs, production activation or a funded rc.2 E2E.

### Configurable confirmation and timing disclosure — deployed in QA

The Jobs panel and read-only workflow-timing endpoint expose selected-contract review/appeal
windows, active deadline countdowns and non-guaranteed estimates. Operator confirmation baseline
is configurable with network minimums; it does not enforce or override a wallet's bound permit.
Web/docs QA were deployed from `0233183efb3e32d09ca0f5bf6c1ac2188921c88d` on 2026-09-09 UTC.
App 229 tests, portal 24 tests and 24 public postchecks passed. Terminal jobs preserve their
original/final decisions and have no active countdown; Chrome verified the completed job view.
The matching SDK change adds version-2 testnet custody policy/progress while keeping version-1
hashes and six-block defaults. Its npm release is separate from the Web deployment. No contract,
production deployment or existing permit changed; the runtime baseline remains 6/6.

### QA SDK prerelease published — 2026-09-08 UTC

npm 0.8.0-rc.1 is published under next; latest remains 0.7.1. Exact registry integrity,
clean installation, import, unsigned registration plan and buyer/provider MCP stdio checks
passed. Published locally with approval, without provenance attestation. No new funded E2E,
LLM call, contract or production deployment. This source documentation reflects publication;
immutable package docs retain their pre-publication wording.

### Controlled Hermes lifecycle verified — 2026-09-08 UTC

One internal sBTC testnet job completed with real Hermes buyer/provider tools, isolated custody,
evaluation and exact 980/20 settlement. Finalization at block 288396/burn 14234 passed the custody
confirmation gate at 14240; escrow zero and reputation synchronization were verified. Existing
registered identities were reused. See [public evidence and release boundaries](developer-portal/content/docs/resources/qa-validation.mdx).
The earlier funded test used QA source, not the public npm 0.7.1 artifact or a new 0.8.0-rc.1 run.
Registry installation and offline checks subsequently passed; a new funded run from npm,
the separate x402 walkthrough and developer video remain pending. No production change or external
adoption is implied. Historical status entries below describe their verification dates.

### QA onboarding checkpoint documentation — 2026-09-07

README and portal clarify separate wallet/escrow funding, bounded buyer/provider gas, custody's
six-burn confirmation policy and job-bound provider handoff. Signing transport remains an
operator responsibility. These documentation updates do not certify the complete autonomous
Hermes E2E, change production contracts, publish npm or claim external adoption.

### Existing-agent documentation candidate — 2026-09-07

The QA documentation now starts with an agent already running its own LLM. It separates
operator-owned wallet/signer preparation, verified on-chain registration, buyer/provider roles
and optional OAuth/direct payments. README and portal navigation link the same onboarding entry.
The local Hermes bridge/manuals remain unreleased QA candidates; full funded autonomous Hermes
E2E and video are not certified by these documentation changes. No model migration or PerkOS-LLM
account is required for external developers. Publication/deployment follows QA review.

### Additive fee candidate — 2026-09-04

Update 2026-09-06: twenty internal real-chain contract paths are complete; the installed QA SDK
passed 168/168 public checks across those jobs. Evaluator compatibility is deployed from QA merge
`66ae96f`; QA Web/Docs merge `9eee547` and the evaluator now select v6/v5 explicitly. Production
still selects v5/v4. The new Web accounting integration exposes
charges/refunds/retained amounts separately from quotes; source availability is not activation.
Coordinated v6/v5 QA selection is complete; the full two-role SDK/LLM workflow remains pending. No
production defaults, contracts or npm package change with this integration.

STX `agentic-commerce-v6` and sBTC `sbtc-commerce-v5` implement a fixed 2% earned service fee,
job-pinned treasury, evidence-backed waivers and treasury-funded refunds. The candidates were
deployed and initialized on testnet on 2026-09-04 from QA merge `556e90a`; seven transactions
returned `(ok true)`, and a separate public source/configuration/transaction postcheck passed 13/13.
The 86 focused simnet cases remain part of the full suite; the reviewed deployment ran 267/267
tests and the static security gate before signing. The twenty real-chain paths later passed as
internal contract evidence, separately from the application/SDK/LLM workflow.
See the [candidate reference](contracts/service-fees-README.md) for the policy and limitations.
No production contract, SDK package or application default was changed.
Opt-in Web fee disclosures and wallet/job-scoped acceptance are served in QA; matching SDK
support is merged to its QA branch, still unreleased. Docs distinguish quotes, charges, waivers
and actual refunds. Dedicated testnet deployment/E2E runners now cover a 20-path matrix, with
signer-free preflights and durable single-broadcast journals; their availability is not on-chain
execution evidence. See [the runbook](docs/TESTNET_SERVICE_FEE_RUNBOOK.md).
QA consumer selection is explicit and operationally separate from source compatibility; no npm
publication accompanies it. Operational custody/reserves and real QA E2E remain required before
commercial activation. Production remains v5/v4.

### Deployed baseline (last verified 2026-09-03)

**Live on Stacks mainnet.**

- Production app: [nayori.ai](https://nayori.ai)
- Developer portal: [docs.nayori.ai](https://docs.nayori.ai), an independent application with
  self-hosted search, generated OpenAPI reference and SDK/commerce guidance. The new existing-agent
  onboarding is a QA documentation candidate, not a completed autonomous Hermes certification.
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
