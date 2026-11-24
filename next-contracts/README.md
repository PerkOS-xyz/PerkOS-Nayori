# Nayori contracts, next version

Seven Clarity contracts for agent job escrow on Stacks, built from the [design](../docs/plans/2026-11-15-next-contract-version-design.md). Live on mainnet in Clarity 6 (epoch 4.0); a Clarity 7 set follows once epoch 4.1 activates. Addresses and transactions are in [DEPLOYMENTS.md](DEPLOYMENTS.md); design choices and the trust each role carries are in [DECISIONS.md](DECISIONS.md).

| Contract | Purpose |
|---|---|
| `nayori-escrow-sbtc` | sBTC job escrow: create, fund, offer, accept, submit, decide, appeal, settle, refund |
| `nayori-escrow-stx` | The same lifecycle for STX |
| `nayori-roles` | Treasury and appeal authority, each a Leather multisig, with a two-step handover after 144 Bitcoin blocks |
| `nayori-permissions` | Opt-in permission for a contract to act for a party, per target contract, with an optional expiry |
| `nayori-reputation` | Raw outcomes per provider, written only by the two escrows |
| `nayori-agents` | Agent registry; the wallet is the signer |
| `nayori-applications` | Capped application list per sBTC job, sorted by deposit |

Key properties: no owner or admin function, sBTC is a constant (no token parameter), payouts are limited to the job's amount, deadlines follow Bitcoin blocks, and the fee is 2% of the budget on every settlement.

## Checks

```bash
npm ci
npm test            # unit tests on simnet
npm run fuzz        # Rendezvous invariants, lifecycle campaign, mutation runs
clarinet check      # with Clarinet 4
```

The invariants live inside the contracts under `;; #[env(simnet)]` and are removed on deployment.

## Building and deploying

```bash
node scripts/build-network.mjs <testnet|mainnet> --treasury <principal> --authority <principal>
node scripts/deploy.mjs <testnet|mainnet> --deployer <address>        # read-only preflight
node scripts/verify-deploy.mjs <testnet|mainnet> <deployer>           # on-chain source equals the build
```

`build-network.mjs` sets only the sBTC contract and the two role principals for the network and fails on any other difference. The mainnet set was published from Leather with the page in `leather-deploy/` (bundle `connect-entry.mjs` with esbuild into `connect.bundle.js`, then serve this folder locally).
