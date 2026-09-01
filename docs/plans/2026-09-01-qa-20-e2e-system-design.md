# Nayori QA 20-scenario end-to-end system design

Status: approved for implementation on 2026-09-01  
Environment: Stacks testnet and the isolated `*.qa.nayori.ai` services only  
Classification: internal controlled QA; never external M2 adoption or revenue

## Objective

Prove that Nayori behaves as one coherent product before external onboarding. The suite covers the
autonomous STX/sBTC contracts, identity, SDK, OAuth, MCP, x402, MPP PaymentAuth, confirmation,
delivery and public evidence. It also reconciles the public README files, developer portal and
landing claims with the behavior observed in QA.

Production is not an execution target for this phase. A mainnet replica plan may be generated only
after every QA scenario passes twice from a clean run and all findings are resolved or explicitly
accepted.

## Safety boundary

- Every state-changing operation must resolve to Stacks testnet chain ID `2147483648`.
- The suite refuses mainnet principals, mainnet API origins and production Nayori origins.
- Positive cases require the exact opt-in `CONFIRM_NAYORI_QA_E2E=yes`.
- Negative cases verify fail-closed behavior and must not broadcast.
- Private keys stay in mode-600 VPS environment files and never enter Git, receipts or logs.
- Client, provider, evaluator, appeal authority and direct-payment payer are distinct principals.
- Each case records its expected asset, amount, recipient, post-conditions and maximum fee before
  invoking a signer.
- Delayed cases are resumable by immutable case ID and job ID; a second preparation broadcast is
  forbidden.
- All participants are PerkOS-controlled and classified `internal-team-operated-not-m2-adoption`.

## System under test

| Plane | QA target | Authority |
| --- | --- | --- |
| Web/discovery | `https://qa.nayori.ai` | Public read-only surface and narrow protocol proxies |
| Documentation | `https://docs.qa.nayori.ai` | Developer guidance only |
| Resource API/MCP | `https://api.qa.nayori.ai` | OAuth-protected API and public paid resources |
| Facilitator | `https://facilitator.qa.nayori.ai` | Quote verification, one broadcast, reconciliation and receipts |
| OAuth | `https://oauth.qa.nayori.ai` | Agent identity, wallet claims and scoped tokens |
| Evaluator | Isolated QA service | Deterministic/LLM decision preparation and allowlisted decision calls |
| STX escrow | `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.agentic-commerce-v5` | Testnet contract state |
| sBTC escrow | `ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.sbtc-commerce-v4` | Testnet contract state |

## Scenario matrix

| ID | Area | Scenario | Required terminal result |
| --- | --- | --- | --- |
| C01 | Contract/STX | Approve, no appeal | `u3`, escrow zero, one exact provider payout, reputation final |
| C02 | Contract/sBTC | Approve, no appeal | `u3`, escrow zero, one exact PoX-5 sBTC payout, reputation final |
| C03 | Contract/STX | Reject, no appeal | `u4`, escrow zero, one exact client refund, reputation final |
| C04 | Contract/sBTC | Reject, no appeal | `u4`, escrow zero, one exact client refund, reputation final |
| C05 | Contract/STX | Approve, appeal, resolve reject | `u4`, original approve preserved, final reject, exact refund |
| C06 | Contract/sBTC | Approve, appeal, resolve reject | `u4`, original approve preserved, final reject, exact refund |
| C07 | Contract/STX | Reject, appeal, resolve approve | `u3`, original reject preserved, final approve, exact payout |
| C08 | Contract/sBTC | Reject, appeal, resolve approve | `u3`, original reject preserved, final approve, exact payout |
| C09 | Contract/STX | Approve, appeal authority timeout | `u3`, original approve preserved, exact provider payout |
| C10 | Contract/sBTC | Approve, appeal authority timeout | `u3`, original approve preserved, exact provider payout |
| C11 | Contract/STX | Evaluator review timeout | `u6`, exact provider payout, no fabricated decision/reputation |
| C12 | Contract/sBTC | Evaluator review timeout | `u6`, exact provider payout, no fabricated decision/reputation |
| I13 | Identity | Anonymous identity plus SIP-018 wallet claim | One claim consumed once; derived wallet and `agent:self` agree |
| I14 | Partner OAuth | Invitation, wallet challenge, registration and token | One-time records consumed; scoped EdDSA token validates |
| I15 | SDK | Clean install, policy-constrained headless on-chain lifecycle | Published SDK creates exact plans and confirms terminal state |
| I16 | MCP/OAuth | Valid call plus missing-scope and invalid-token probes | Valid call succeeds; invalid authorization is rejected without side effects |
| P17 | x402/STX | Public resource purchase | One payment, canonical confirmation, signed receipt, one delivery |
| P18 | x402/sBTC | Isolated merchant resource purchase | Canonical PoX-5 transfer, confirmation, receipt and one delivery |
| P19 | x402/USDCx | Isolated merchant resource purchase | Canonical testnet USDCx transfer, confirmation, receipt and one delivery |
| P20 | MPP/USDCx | PaymentAuth public resource purchase | One confirmed charge, `Payment-Receipt`, one idempotent delivery |

## Evidence contract

Every scenario writes a secret-free JSON receipt containing suite version, exact repository
anchors, case ID, actor addresses, asset, atomic amount, contract/endpoint, expected invariants,
transaction IDs, block heights, public event references, before/after balances, checks and result.
The receipt is canonicalized and hashed with SHA-256. Delayed cases additionally store the deadline
and phase. A suite manifest hashes all 20 receipts and distinguishes prepared, awaiting-deadline,
passed, failed and blocked states.

The public evidence dashboard is checked only after Hiro reports canonical state. A transaction
accepted for broadcast is never described as confirmed. Replay probes reuse the exact signed
payload only after the first settlement is terminal and must produce no second broadcast, receipt
or delivery.

## Promotion gate

1. All five repositories pass their native verification suites and high-severity dependency audit.
2. README, OpenAPI, discovery, docs and landing claims match the observed QA capabilities.
3. All 20 scenarios pass once; every finding is fixed and traced to a commit.
4. All 20 scenarios pass again with fresh case IDs and no state contamination.
5. Receipt hashes, public transaction links and a production translation matrix are reviewed.
6. Mainnet execution requires a separate explicit authorization, budgets, exact production
   contracts, external-review disposition and non-team attribution rules.

