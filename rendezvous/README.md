# Rendezvous fuzzing for sbtc-commerce-v5

The escrow's invariants, written in Clarity and checked with
[Rendezvous](https://github.com/stx-labs/rendezvous) (`rv` 1.1.0). This folder
is its own Clarinet project and npm package, so the fuzzer's newer Clarinet SDK
does not touch the unit-test toolchain at the repo root.

```bash
cd rendezvous
npm ci
npm run fuzz        # all three campaigns below
npm run invariant   # rv invariant mode: random calls, random callers
npm run test        # rv property mode
npm run lifecycle   # stateful lifecycle campaign, same invariants
```

## How the harness is built

Rendezvous 1.x reads invariants from the contract under test. `rv-sync.sh`
therefore generates `contracts/sbtc-commerce-v5.clar` as the deployed source
plus `harnesses/sbtc-commerce-v5.tests.clar`, and copies its dependencies
(`sip-010-trait`, `reputation-registry-v3`, the mock sBTC token). Edit the real
contracts or the harness, never the generated files.

One test-only patch is applied, and the script fails if anything else differs:

- `REVIEW_WINDOW_BURN_BLOCKS` u12 -> u144. rv mines up to 100 burn blocks
  between random call batches, so a 12-block window closes before an
  evaluator can act and the decision paths would never run. No invariant
  depends on the window length; the 12-block window itself is covered by
  `tests/sbtc-commerce.test.ts`.

At deploy the harness initializes the protocol with the mainnet appeal window
(144 burn blocks), sets the mock sBTC as the default token, registers the
escrow as a `reputation-registry-v3` caller and funds the fuzz wallets with
both mock tokens. Canonical sBTC needs epoch 3.0 in simnet, so the mock stands
in for it; a second instance (`mock-sbtc-token-alt`) lets the fuzzer try token
substitution.

The fuzz callers are three wallets, the appeal authority and the treasury
(`rv.config.json`). The contract owner is not one of them, so owner-only
administration is only ever attempted by non-owners; the two-step handovers
are covered by the unit tests.

## Invariants

| Invariant | What must always hold |
|---|---|
| `invariant-escrow-equals-token-balance` | Per token, the escrow's balance equals the sum of live job escrows: nothing paid twice, nothing stranded, the second token never enters. |
| `invariant-sbtc-conserved` | Wallets plus escrow hold the whole minted supply: no sats leave the job parties. |
| `invariant-jobs-consistent` | For every job: escrow exists exactly while the job is live and equals its budget, with a pinned token; client, provider, evaluator, appeal authority and treasury are distinct; a decision exists exactly from the evaluator's decision on, only the losing side appeals, and the final decision matches the status; a fee settlement exists exactly for completed or rejected jobs, with gross = budget = net + fee, a 2% fee (or 0 under a waiver), the right recipient, and refunds bounded by the fee and backed by a waiver; ratings only on completed jobs; reputation synced exactly once per settled job. |
| `invariant-roles-stable` | Non-owners cannot change the owner, default token, appeal authority, treasury or appeal window. |
| `invariant-harness-capacity` | The campaign stays within the 400 jobs the per-job checks inspect, so it fails rather than check fewer. |

Property (`rv test`): `test-service-fee-split`, the quoted fee is
floor(gross / 50) and fee + net = gross.

## Campaigns

- **rv invariant** (1000 runs, `fail_on_unchecked`): rv picks the function and
  the caller uniformly. `dialers.js` folds random arguments into useful ranges
  (existing job IDs, the default token most of the time, valid hashes), always
  as a pure function of the generated value, so a seed replays exactly. This
  campaign is broad but shallow: a job seldom walks all six steps.
- **lifecycle** (`lifecycle.mjs`, 40 runs of 150 to 300 actions): built on the
  same generated contract with fast-check. Four actions in five go to a job
  whose state allows them and are sent by the account holding the matching
  role; the rest go to any job from any account. Burn blocks are mined as an
  action. All five invariants are checked after every action, and the run
  fails if any settlement path never succeeds.

A run on 2026-11-15 (seed 7) reached every path: 360 jobs created, 153
funded, 101 submitted, 39 decisions, 22 appeals, 8 appeals resolved, 8 appeal
timeouts, 40 review timeouts, 43 expiries, 26 fee waivers and a refund.

To check the invariants are not vacuous, these bugs were injected into the
generated contract one at a time; each was caught:

| Injected bug | Caught by |
|---|---|
| finalize keeps the escrow entry | `invariant-escrow-equals-token-balance` |
| 3% fee instead of 2% | `invariant-jobs-consistent` |
| expiry refunds nothing | `invariant-escrow-equals-token-balance` |
| review timeout leaves the job submitted | `invariant-jobs-consistent` |
