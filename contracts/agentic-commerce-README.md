# Nayori Agentic Commerce

Non-custodial job escrow for STX and sBTC on Stacks. The active contracts are
`agentic-commerce-v4` and `sbtc-commerce-v3`; both use `reputation-registry-v3`.

## Active mainnet contracts

Deployer: `SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH`

| Asset | Contract |
| --- | --- |
| STX | `agentic-commerce-v4` |
| sBTC | `sbtc-commerce-v3` |
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
(retry-reputation-sync job-id)
(rate-provider job-id score comment)
```

STX settlement functions:

```clarity
(fund-job job-id)
(complete-job job-id)
(reject-job job-id)
(settle-review-timeout job-id)
(expire-job job-id)
```

sBTC settlement passes the SIP-010 token trait explicitly:

```clarity
(fund-job job-id token)
(complete-job job-id token)
(reject-job job-id token)
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
