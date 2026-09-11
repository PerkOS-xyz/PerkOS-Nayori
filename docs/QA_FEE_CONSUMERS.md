# Earned-service-fee QA consumer gate

This is a coordinated **testnet-only** operational selection, not a change to production defaults.
All five Nayori repositories are public; runtime configuration, credentials and internal evidence
remain outside Git. No private key or LLM/merchant credential is needed in a browser build.

## Selected QA release

QA Web/Docs source is merge `9eee547f7fdc5371bece2dc0c91f84b9a4e4b02c` ([PR #133](https://github.com/PerkOS-xyz/PerkOS-Nayori/pull/133));
Evaluator source remains `66ae96f138d78808eccdd2294cf10816e5dca1f1`. Both explicitly select
STX v6/sBTC v5 on testnet. This is a runtime/configuration gate, not a new contract deployment.
Production remains v5/v4 and the full buyer/provider SDK plus actual evaluator E2E remains open.

## Source and state requirements

1. Review and merge Web/Docs fee evidence support to `qa`; pass both baseline v5/v4 and fee v6/v5
   frontend CI builds. Keep source SHA, archive digest, public configuration and resulting image
   digest together in the operational receipt.
2. Require the deployed Evaluator to contain QA merge `66ae96f` or a reviewed descendant. This
   release supports both explicit pairs; deployment alone did not select fees.
3. Pin the tested SDK candidate from QA `458b481` or a reviewed descendant. Its packed source is
   not the npm0.7.1 package; do not install an unversioned production upgrade to enable fees.
4. Check public testnet source/policy, canonical sBTC, reputation authorization, separate roles,
   pinned treasury and the recovery/reserve procedure. The contract20/20 and installed-SDK
   read168/168 gates passed; real buyer/provider SDK plus evaluator execution remains separate.

## Matching selection

Testnet deployer: `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5`.

| Consumer | Explicit selection |
| --- | --- |
| Web build | `NEXT_PUBLIC_STACKS_NETWORK=testnet`; same deployer; `NEXT_PUBLIC_STX_COMMERCE_CONTRACT=agentic-commerce-v6`; `NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT=sbtc-commerce-v5` |
| Evaluator | `STACKS_NETWORK=testnet`; full `STX_COMMERCE_CONTRACT` and `SBTC_COMMERCE_CONTRACT` principals under that deployer |
| SDK | `network: 'testnet'`; full principals through `contracts.stxCommerce` and `contracts.sbtcCommerce` |
| Docs | QA origins, matching integration instructions, explicit candidate/unpublished SDK limitation |

Keep reputation-v3, evaluator and human authority identities unchanged. The QA contract policy
is200 basis points,12 burn blocks for review and3 for appeal. Do not shorten deadlines or use
mainnet constants to accelerate testing. The treasury cannot be the client, provider, evaluator
or appeal authority. Never send a treasury key to the evaluator or LLM.

The QA deployment controller explicitly pins Web build arguments to v6/v5; production remains
v5/v4. A runtime `.env` change does not override baked values. Review future scoped QA
configuration/controller adjustments separately and record them; do not bypass network or release checks. Build on the
VPS, stage the exact reviewed source from the maintainer's Mac, and do not retag production images.
Prevent new test jobs while consumers are being coordinated. Preserve access to old job identities;
never reinterpret an old `(contract, job-id)` as belonging to the new contract.

The Web job route is a view of the currently selected generation, not an immutable historical
permalink. Retain the full contract principal, asset, job ID and explorer proof in receipts;
read historical jobs with an explicitly configured SDK. The seven prior QA v5/v4 jobs were
terminal with zero escrow before this selection; their identities and evidence remain unchanged.

## Before a new economic job

- Web health/discovery must report QA/testnet and the new full principals. Verify the browser
  bundle, not just server environment variables.
- Evaluator readiness must report `service-fee-v6-v5`,200 bps and its dedicated testnet principal.
  Confirm it rejects unauthenticated processing, wrong pairs and stale/inconsistent jobs.
- `/api/evidence.json.serviceFees` must be live for the selected contracts or clearly unavailable
  on source failure. Verify quoted, charged, refunded, retained and refund-due totals against the
  already completed jobs. Accounting uses existing validated ledger reads, not additional RPCs;
  an HTTP429 or incomplete asset read must not be hidden as a zero total.
- Known QA provider and treasury wallets must remain team-operated, not external adoption.
- Web/Docs production release/image/configuration must remain unchanged. x402 and MPP profiles
  keep their own testnet assets and exact recipient; changing escrow selection must not alter them.

## Real lifecycle evidence

Use a clean installation of the pinned SDK, persistent separate buyer/provider signers and the
real evaluator service. The SDK must enforce explicit fee acceptance before funding/submitting.
Check registration/discovery, creation, exact funding, provider submission, evaluation artifacts,
one canonical decision, deadline/appeal, final payout/refund, treasury fee and reputation. Record
request identity and txid before retry; never replay ambiguous broadcasts or fabricate evaluation
success to complete a demo. Wait for canonical success and verify unique transfer events.

Do not shorten or bypass the appeal period; use the reviewed appeal/authority flow where appropriate.
Do not count model agreement, an HTTP200, a quote, a pending tx or a fee preview as a completed job.
The same-origin x402 paid-resource test is a distinct payer-approved workflow, not the escrow2%.
No new test job should be funded until required signers, gas, asset balance and recovery steps are
available. Testnet results are internal operability evidence, never external M2 adoption or revenue.
