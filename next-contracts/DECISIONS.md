# Decisions

Short records of design choices for the next contract version and the trust they assume.

## D1. No owner, no admin functions
No contract has an owner. The token, fee, limits and the reputation writers are fixed in code. A mistake in a deployed rule needs a new deployment, not an admin call.

## D2. sBTC is a constant
The sBTC escrow calls the canonical sBTC contract through a constant and takes no token parameter. A contract that can vary would instead be passed as a trait and verified against the contract stored when the job was funded.

## D3. Roles are pinned per job; handovers are direct only
The treasury and the appeal authority are read when a job is created and pinned to it. A handover applies to new jobs only, so a job's rules never change mid-flight. Handovers take two steps, wait 144 Bitcoin blocks, and never accept delegation. The roles are Leather multisig accounts; protection against a stolen key is the multisig itself. If a role key is fully compromised, jobs created before a handover keep the old holder until they settle.

## D4. Delegation is opt-in, per target contract
A party is `tx-sender`. A call through another contract counts only if the party allowed that contract for that one Nayori contract, optionally until a Bitcoin block height. An allowed helper contract must check its own caller; otherwise any contract the party later calls can route through it. Users should allow only helpers that do, and prefer an expiry.

## D5. Reputation is raw data, not a score
The registry records outcomes, settled value per asset, distinct clients, non-deliveries and client ratings. Self-dealing is possible and costs the 2% fee on every job (the treasury itself would pay no net fee); readers should weigh value and distinct counterparties.

## D6. The evaluator and the appeal authority are trusted for their jobs
The client chooses the evaluator, and the provider sees it before accepting. If the evaluator rejects and an appeal is not resolved within 144 blocks, the rejection stands. The appeal authority can decide disputed jobs pinned to it, but cannot start disputes, move funds or touch undisputed jobs.

## D7. The application list is optional
Applications are a capped list sorted by deposit; a full list admits a higher deposit and refunds the lowest. Fifty applications at the maximum deposit can fill a list, and a client can decline them (declined applicants cannot reapply to that job). Hiring never depends on the list: the client can offer the job to any provider directly.

## D8. The delivery window starts at acceptance
Before acceptance, the job's deadline limits funding, offering and accepting. Acceptance resets it to acceptance plus the job's delivery blocks, so a provider always gets the full window.

## D9. Funds sent directly to a contract stay there
There is no sweep function. sBTC or STX sent to a contract outside the job and application flows remains in it; it never blocks a flow. On mainnet the balance invariants therefore hold as "at least".

## D10. Wallet post-conditions
Contract outflows (settlement, refunds, application refunds) need post-conditions on the contract principal. For `apply-to-job` on a full list, the displaced amount can change before inclusion, so wallets should allow up to the maximum deposit rather than an exact amount.

## D11. Deployment guard
`nayori-roles` aborts deployment unless the two role principals differ and both belong to the network being deployed to (`is-standard`). Mainnet values are set per network before deployment.
