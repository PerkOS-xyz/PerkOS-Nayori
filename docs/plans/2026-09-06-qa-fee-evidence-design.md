# QA fee evidence and coordinated selection

## Decision

Preserve production defaults and explicitly select STX v6/sBTC v5 only in the QA build and
evaluator configuration after this reviewed integration. Global default replacement would affect
other environments; duplicating services would add unnecessary custody and deployment boundaries.

The QA controller currently hardcodes v5/v4 Web build arguments. Changing a runtime environment
file alone cannot change the browser bundle. A coordinated operational release must record source
SHA, public build configuration, image digest and the evaluator's selected pair. Do not rewrite
the controller or activate consumers as a side effect of this source change.

## Evidence boundary

Extend the existing `/api/evidence.json` snapshot and `/evidence` page with independent fee
accounting derived from already-loaded, validated per-job ledgers. No additional network calls,
database, signing, payment scopes or custody. Separate STX and sBTC and group by pinned treasury.
Use bigint for all sums and decimal strings in JSON; never aggregate unlike assets or infer USD.

Expose potential quotes, actually charged amounts, actual refunds, retained amounts and waived
but still outstanding refunds separately. No ledger means no collected fee. A waiver alone is
not a refund. If any selected asset's required job/fee data is missing, malformed or duplicated,
its totals are unavailable rather than partial or zero. Other assets remain independently usable.
Existing generations are explicitly not supported by fee accounting. Chain-wide unavailable
snapshots never publish empty fee totals as successful reads.

The scope is jobs in the selected active contract, not historical generations, a treasury wallet
balance or externally earned revenue. QA/controlled wallets are not M2 adoption. Mark known
internal QA provider and treasury identities as team-operated in the existing evidence catalogue.
Keep existing metrics and curated CSV semantics unchanged.

## Gates

Test both assets, arithmetic over Number.MAX_SAFE_INTEGER in aggregate, same IDs across contracts,
duplicates, absent ledger, waiver before/after settlement, real refunds, partial reads, disabled
generation and unavailable source. Render the panel and verify JSON serialization. Build/test
both v5/v4 and v6/v5 QA selections; no production defaults change. Align README/Docs with the
completed contract20/20, installed-SDK read168/168 and deployed evaluator compatibility, explicitly
distinguishing these from full SDK/LLM lifecycle execution.

After merge, coordinate QA build/evaluator selection, verify public manifests, ledger accounting,
internal actor classification and unchanged production. Then run bounded real buyer/provider SDK
jobs with actual evaluator decisions and exact payout/fee/refund evidence. x402 direct payments
remain a separate confirmation-gated flow, not escrow fee collection. No new economic transaction
is authorized by a public evidence GET or by this PR.
