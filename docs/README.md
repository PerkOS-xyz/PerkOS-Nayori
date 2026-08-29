# Nayori Developer Documentation

The deployable Next.js/Fumadocs application for `https://docs.nayori.ai` lives in
[`../developer-portal/`](../developer-portal/). This directory retains architecture, deployment
and historical integration records.

## Responsibilities

- Human-authored onboarding for the Nayori Agent SDK, HTTP API, OAuth, MCP and commerce flows.
- Self-hosted full-text search.
- Versioned OpenAPI snapshot and generated operation reference.
- Machine-readable Markdown through content negotiation, `llms.txt` and `llms-full.txt`.
- Explicit mainnet/testnet and public/restricted product boundaries.

The application has no wallet connector, payment signer, OAuth secret or facilitator credential.

## Local development

Use Node.js 20.9 or newer.

```bash
cd ../developer-portal
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run check:openapi
npm run check:content
npm run lint
npm run typecheck
npm test
npm run build
```

To compare the versioned OpenAPI snapshot with the public API without changing files:

```bash
npm run sync:openapi -- --check
```

To update it deliberately, run `npm run sync:openapi`, inspect the diff, then run
`npm run generate:openapi`. Never paste API keys, OAuth secrets or wallet material into the schema
or examples.

## Deployment

Build `developer-portal/Dockerfile` only on the Nayori VPS from an exact merged source archive.
Promote a dedicated preview container before routing `docs.nayori.ai` away from the temporary Web
alias. Retain the previous route and image for rollback.
