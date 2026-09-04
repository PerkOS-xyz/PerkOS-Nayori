# Nayori Agentic Commerce

Non-custodial job escrow for STX and sBTC on Stacks. The active contracts are
`agentic-commerce-v5` and `sbtc-commerce-v4`; both use `reputation-registry-v3`.

An additive [earned-service-fee candidate](service-fees-README.md) introduces STX v6 and sBTC
v5 for simnet validation. It is not deployed or selected by the application; the active
generation and existing jobs retain their original full-budget settlement policy.

## Active mainnet contracts

Deployer: `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH`

| Asset | Contract |
| --- | --- |
| STX | `agentic-commerce-v5` |
| sBTC | `sbtc-commerce-v4` |
| Reputation | `reputation-registry-v3` |

The sBTC contract accepts canonical mainnet sBTC only:
`SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`.

## Job states

| Code | State | Meaning |
| ---: | --- | --- |
| `u0` | Open | Created and not yet funded |
| `u1` | Funded | Exact asset is held in escrow |
| `u2` | Submitted | Work is awaiting evaluator review |
| `u3` | Completed | Evaluator approved and provider was paid |
| `u4` | Rejected | Evaluator rejected and client was refunded |
| `u5` | Expired | Open/funded job expired and was refunded as applicable |
| `u6` | Timeout paid | Review window elapsed and provider was paid without completion credit |
| `u7` | Decision pending | Evaluator hashes are recorded; escrow has not moved |
| `u8` | Disputed | Eligible party appealed; the pinned authority may resolve |

Submitted work has a fixed 12 Bitcoin burn-block review window. The evaluator remains authoritative
through the exact deadline. After it, any caller may trigger the deterministic timeout payout.
`u6` is deliberately excluded from completed-job reputation and rating eligibility.

## Lifecycle functions

Both escrow contracts expose:

```clarity
(create-job provider evaluator expired-at description)
(set-budget job-id amount)
(assign-provider job-id provider)
(submit-work job-id deliverable)
(record-decision job-id decision evidence-hash explanation-hash)
(appeal-decision job-id appeal-evidence-hash)
(retry-reputation-sync job-id)
(rate-provider job-id score comment)
```

STX settlement functions:

```clarity
(fund-job job-id)
(finalize-decision job-id)
(resolve-appeal job-id final-decision resolution-hash)
(settle-appeal-timeout job-id)
(settle-review-timeout job-id)
(expire-job job-id)
```

sBTC settlement passes the SIP-010 token trait explicitly:

```clarity
(fund-job job-id token)
(finalize-decision job-id token)
(resolve-appeal job-id final-decision resolution-hash token)
(settle-appeal-timeout job-id token)
(settle-review-timeout job-id token)
(expire-job job-id token)
```

The sBTC token used at funding is pinned per job. Later settlement must use that same principal;
changing the default token cannot alter a funded job.

## Read-only functions

```clarity
(get-job job-id)
(get-job-count)
(get-escrow-balance job-id)
(get-review-window)
(get-reputation-sync job-id)
(has-rated-job job-id rater)
```

The sBTC contract additionally exposes `get-payment-token` and `get-job-payment-token`.

## Security properties

- Client, provider and evaluator are distinct parties.
- Only the evaluator may complete or reject during the review window.
- Funding and payouts use exact deny-mode post-conditions in the Web and SDK.
- sBTC settlement is bound to the funded job's pinned SIP-010 token.
- Failed reputation writes never roll back economic settlement and can be retried.
- Ownership transfer requires proposal and acceptance by the new owner.
- Every lifecycle transition emits an indexable `print` event.

The prior mainnet generation remains immutable historical M1 evidence and is not the default for
new jobs. Internal deployment and smoke actors do not count as external adoption or revenue.

## Autonomous evaluator and appeals

`agentic-commerce-v5` and `sbtc-commerce-v4` are deployed on mainnet and selected by the Web
production release. They retain the 12-burn-block evaluator response window and add these
non-terminal states without changing historical codes:

| Code | State | Meaning |
| ---: | --- | --- |
| `u7` | Decision pending | Nayori recorded approve/reject evidence; escrow has not moved |
| `u8` | Disputed | The eligible economic party appealed; escrow remains locked for resolution |

The accepted immutable policy values are three Bitcoin burn blocks for isolated QA/testnet or 144
for mainnet. Every job pins the active appeal authority, so later two-step rotation cannot change
who resolves an existing appeal.

The evaluator records a decision, evidence digest and public-explanation digest but cannot settle
immediately. For approval, only the client may appeal; for rejection, only the assigned provider
may appeal. Unappealed decisions are permissionlessly finalizable only after the exact deadline.
The pinned human authority may uphold or reverse an appealed decision through its resolution
deadline. If that authority becomes unavailable, a permissionless liveness path finalizes the
original decision only after the second deadline.

Only final settlement moves funds or writes completed/disputed reputation. Approvals pay exactly
the pinned provider, rejections refund exactly the pinned client, and sBTC uses the per-job pinned
SIP-010 token. This generation removes the immediate `complete-job` and `reject-job` entrypoints.
