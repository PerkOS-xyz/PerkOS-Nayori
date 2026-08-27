# Nayori public API discovery design

Date: 2026-08-26

## Goal

Make Nayori's public web discovery accurately expose the live quote API at
`https://api.nayori.ai` while preserving the distinction between the mainnet web application and
the testnet-only API. The change must improve machine discovery without proxying API traffic,
changing contracts, or implying that a quote proves payment.

## Public contract

The web manifest will keep `stacks:1` as the application and escrow network. A separate
`quoteService` object will describe the API as `quote-only` on Stacks testnet
(`stacks:2147483648`) and link its agent manifest, supported-capabilities response, OpenAPI schema
and JWKS. Availability flags will state exactly what exists: public API and quote issuance are
true; payment verification, settlement, fee sponsorship and A2A are false.

`llms.txt` will publish the same boundary in prose. It will explain that authenticated merchants
can request short-lived, request-bound quotes, and that consumers must not treat those quotes as
payment or settlement evidence. The public README, status and deployment guide will use the same
language.

## Validation

Unit tests will assert canonical URLs, the API network and every negative capability. The web app
will still pass lint, TypeScript checks and a production build. Public endpoints will be checked
directly after deployment. `isitagentready.com` will be used as a supplementary external score
when its browser-access policy permits the evaluation; its score will not override the more
precise capability contract above.

## Non-goals

- No browser-side API proxy.
- No facilitator settlement, transaction broadcasting or sponsorship claim.
- No contract deployment or modification.
- No disclosure of private platform infrastructure or credentials.
