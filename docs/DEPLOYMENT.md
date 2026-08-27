# PerkOS deployment guide

## Production

PerkOS is deployed on Stacks mainnet under:

`SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH`

The production frontend is [nayori.ai](https://nayori.ai). The historical PerkOS URL remains a
compatibility entry point.

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

Configure these values in the target production build environment:

```env
NEXT_PUBLIC_STACKS_NETWORK=mainnet
NEXT_PUBLIC_CONTRACT_ADDRESS=SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH
NEXT_PUBLIC_STX_COMMERCE_CONTRACT=agentic-commerce-v2
NEXT_PUBLIC_SITE_URL=https://nayori.ai
```

Rebuild the production deployment after changing environment variables.

The app supports a non-root standalone container through `App/Dockerfile`. Build images only on
the Nayori deployment VPS. A candidate for `preview.nayori.ai` must use its own
`NEXT_PUBLIC_SITE_URL`; validate `/api/health`, wallet connection and all public routes before
production promotion. Retain the previous production image and Compose file as rollback.

### Agent-readiness smoke checks

Before promotion, verify GET and HEAD behavior, media types and CORS for:

- `/.well-known/api-catalog` (`application/linkset+json`);
- `/.well-known/ard.json` and `/.well-known/ai-catalog.json`;
- `/.well-known/agent-skills/index.json` and every indexed `SKILL.md`;
- `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource` and `/auth.md`;
- `/.well-known/mcp/server-card.json` and `/x402.json`;
- `/evidence`, `/api/evidence.json` and `/api/evidence.csv`;
- `/robots.txt`, including `Content-Signal` and `Agentmap`; and
- `/` with both HTML and `Accept: text/markdown`, including discovery `Link` headers.

Recompute each skill SHA-256 over the exact response bytes and compare it with the index digest.
Use a browser with WebMCP instrumentation to confirm the three public tools exist at load time and
remain read-only. Finally, rerun [isitagentready.com](https://isitagentready.com/nayori.ai) against
the preview. OAuth/MCP proxy routes must return the canonical documents from the live Platform;
promote Platform before web. Publish DNS-AID only after those production endpoints are independently
testable.

## Nayori partner API

The public API is available at [api.nayori.ai](https://api.nayori.ai) as a separate, testnet-only
service. Its invite-only production contract is intentionally narrow:

- invited partners bind an OAuth client to a Stacks wallet through an exact Leather-signed challenge;
- API keys remain backward compatible, while OAuth uses short-lived scoped client-credentials tokens;
- authenticated partners can issue quotes, verify payments, request one testnet broadcast, read
  confirmation state and use the idempotent delivery ledger;
- the experimental MCP endpoint exposes only implemented discovery, quote and settlement-read tools;
- supported assets are STX, sBTC and USDCx on `stacks:2147483648`;
- machine discovery is available through
  [the agent manifest](https://api.nayori.ai/.well-known/agent.json),
  [`/supported`](https://api.nayori.ai/supported),
  [OpenAPI](https://api.nayori.ai/openapi.json) and
  [JWKS](https://api.nayori.ai/.well-known/jwks.json),
  [OAuth metadata](https://api.nayori.ai/.well-known/oauth-authorization-server),
  [auth.md](https://api.nayori.ai/auth.md) and the
  [MCP Server Card](https://api.nayori.ai/.well-known/mcp/server-card.json); and
- mainnet settlement, fee sponsorship and arbitrary resource proxying are disabled.

Do not treat a signed quote, verification, broadcast or pending response as proof of confirmed
settlement. OAuth cannot sign a payment; the payer separately authorizes every transaction. The API is deployed independently
from this public web repository, and no private platform configuration or credentials belong in
this repository.

## Testnet

Use `App/testnet.env.example` for a branch-scoped Vercel Preview. Testnet validation
must not replace the Production variables above. The existing testnet STX v2 lifecycle
can be reproduced with:

```bash
npm run e2e:stx-v2:testnet
```
