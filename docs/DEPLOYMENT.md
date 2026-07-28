# PerkOS deployment guide

## Production

PerkOS is deployed on Stacks mainnet under:

`SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH`

The production frontend is [stacks.perkos.xyz](https://stacks.perkos.xyz).

The current product stack contains:

- `agent-registry`
- `validation-registry`
- `sip-010-trait`
- `reputation-registry-v2`
- `agentic-commerce-v2` for STX escrow
- `sbtc-commerce` for sBTC escrow

Legacy STX contract names are intentionally excluded.

## Mainnet deployment

The deployment command is guarded, source-aware and resumable. It skips an existing
contract only when its on-chain source exactly matches the reviewed local source. It
aborts if a contract name already contains different code.

Keep the signer file outside version control:

```env
DEPLOYER_ADDRESS=SP...
DEPLOYER_PRIVATE_KEY=...
```

Then run:

```bash
MAINNET_ENV_PATH=/absolute/path/to/.env.mainnet \
CONFIRM_PERKOS_MAINNET_DEPLOY=yes \
npm run deploy:mainnet
```

The script:

1. validates that the private key derives the configured mainnet address;
2. compares all six contract sources against mainnet;
3. checks the available STX balance and maximum configured fees;
4. deploys only missing current contracts, one confirmation at a time;
5. configures canonical mainnet sBTC; and
6. authorizes both escrow contracts on `reputation-registry-v2`.

A secret-free receipt is written to `/tmp/perkos-mainnet-promotion.json`.

## Independent verification

No wallet or private key is needed:

```bash
npm run verify:mainnet
```

This compares all deployed source code, verifies exposed owners, confirms the canonical
sBTC token and both reputation allowlist entries, and reads the current agent and job
counts.

## Frontend production variables

Configure these values for the Vercel Production environment:

```env
NEXT_PUBLIC_STACKS_NETWORK=mainnet
NEXT_PUBLIC_CONTRACT_ADDRESS=SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH
NEXT_PUBLIC_STX_COMMERCE_CONTRACT=agentic-commerce-v2
```

Rebuild the production deployment after changing environment variables.

## Testnet

Use `App/testnet.env.example` for a branch-scoped Vercel Preview. Testnet validation
must not replace the Production variables above. The existing testnet STX v2 lifecycle
can be reproduced with:

```bash
npm run e2e:stx-v2:testnet
```
