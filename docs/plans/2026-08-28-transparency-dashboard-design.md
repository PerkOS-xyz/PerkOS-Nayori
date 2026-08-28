# Nayori public transparency dashboard design

Date: 2026-08-28
Status: approved for implementation
Scope: public Web repository only; no contract or payment-runtime change

## Outcome

`/evidence` becomes the canonical **Nayori Transparency Dashboard** without changing its public
URL. It consolidates the useful information currently split across `/dashboard`, `/stats`,
`/activity` and the static evidence manifest. The existing routes remain available, while the
canonical page provides one reviewer- and partner-friendly view.

The dashboard must distinguish three concepts:

1. **Observed on-chain totals** read from Stacks mainnet.
2. **M2 qualifying progress**, with the approved M1 baseline excluded.
3. **Attested external adoption**, which is never inferred from address uniqueness.

## Data sources and trust boundaries

- Contract read-only calls provide agent count, agent records, STX jobs and sBTC jobs.
- Hiro's public API provides confirmed contract-call activity, transaction status, sender, block
  time, contract and explorer-verifiable transaction IDs.
- The versioned public evidence manifest remains the source for the approved M1 lifecycle, team
  wallet classifications, M2 targets, public SDK distribution and explicit external attestations.
- Wallets not present in the team list are `unattested`, not automatically external.
- No browser cookie, wallet credential, API key or private Platform data is required or exposed.

The public JSON endpoint aggregates these sources at request time and uses a short public cache.
Source failures are represented explicitly as `unavailable` or `partial`; they must not silently
become zero usage. The static M1 record stays available even if live indexing is unavailable.

## Public schema and compatibility

`GET /api/evidence.json` remains the machine-readable canonical endpoint and evolves additively to
schema version 2. Existing `milestone1`, `milestone2`, `policy` and distribution fields remain.
The response adds:

- generation time, freshness and source health;
- observed agent/job/transaction/wallet totals;
- registered-agent and job summaries;
- recent explorer-linked transactions;
- qualifying counters derived conservatively from the explicit baseline and attestations.

`GET /api/evidence.csv` remains a stable export of the explorer-verifiable M1 lifecycle. The
dashboard links to JSON for the full live snapshot and to the existing CSV for the approved
transaction baseline.

## Dashboard layout

1. Header with network, freshness, source status and JSON/CSV exports.
2. On-chain overview cards: agents, total jobs, completed sBTC jobs, completed STX jobs, contract
   calls and distinct wallets.
3. Grant progress cards showing target, observed total and M2-qualifying value.
4. Registered agents table with ID, active state, wallet classification and contract link.
5. Jobs table with asset, status, amount and shortened client/provider/evaluator principals.
6. Recent transactions table with function, contract, sender, time, status and Explorer link.
7. Approved M1 lifecycle and the evidence policy.

The page uses responsive tables with horizontal overflow rather than hiding evidence on mobile.
No chart is required: exact counts and mappings are more useful than decorative time series.

## Failure handling and tests

- A failed chain snapshot produces an explicit warning and unavailable live sections.
- Partial expected records fail the snapshot rather than undercounting.
- Percentages are bounded from 0 to 100 and zero targets cannot divide by zero.
- Unit tests cover baseline exclusion, wallet classification, observed-versus-qualifying metrics,
  status summaries and failure-safe response construction.
- Existing evidence, discovery, WebMCP and agent-readiness contracts remain compatible.
- Required verification: frontend tests, ESLint, production build and high-severity npm audit.

## Deferred work

A persistent Chainhook-backed index in Platform is the long-term scaling path for pagination,
historical charts and operational alerts. It is intentionally deferred until partner volume makes
browser/server aggregation insufficient. Mainnet facilitator settlement and sponsorship remain
fail-closed pending the external M2 security review.
