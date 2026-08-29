# Nayori professional developer portal design

Date: 2026-08-28
Status: approved

## Objective

Replace the temporary `docs.nayori.ai` alias of the transactional Web application with a complete,
independently deployable developer portal. The portal must support credible external onboarding
before partner invitations begin and must describe the whole Nayori product without exposing
private runtime configuration or overstating mainnet readiness.

## Decisions

- Add a separate `Docs/` Next.js application inside the public `PerkOS-Nayori` repository.
- Deploy it as an independent VPS container and route only `docs.nayori.ai` to it.
- Use Fumadocs UI/MDX with self-hosted ZBSearch, generated OpenAPI reference pages and Nayori brand
  styling. The docs runtime has no wallet connection and no authority to sign or settle payments.
- Keep human-authored guides in versioned MDX. Keep a versioned OpenAPI snapshot and fail checks
  when the snapshot is structurally invalid or drifts from an explicitly supplied authoritative
  schema.
- Do not introduce documentation versioning until multiple incompatible public versions exist.
- Use product-maturity labels rather than grant milestone terminology on the public site.
- Use Stacks orange `#FC6432` for all Mermaid borders, edges and signals.

## Information architecture

The top-level navigation is:

1. Overview and choose-your-path onboarding.
2. Getting started with the SDK and HTTP API.
3. Agent identity, OAuth and MCP.
4. STX and sBTC escrow lifecycle.
5. x402 direct payments for STX, sBTC and USDCx.
6. MPP PaymentAuth for USDCx.
7. API reference generated from OpenAPI.
8. Smart-contract reference and deployed addresses.
9. Architecture, security and operational boundaries.
10. Resources, evidence, troubleshooting and known limitations.

Each operational page displays explicit network and access badges such as `Mainnet`, `Testnet`,
`Public`, `Invite-only` or `Planned`. Every onboarding path ends in a testable success condition and
points to the next safe action.

## Application architecture

`Docs/` owns its package manifest, lockfile, TypeScript configuration, Fumadocs configuration,
content tree, public assets, tests and Dockerfile. It builds independently from `App/` and uses a
non-root standalone container. The root path is the documentation homepage; document routes are
root-relative so `docs.nayori.ai/getting-started` is canonical rather than a nested `/docs` path.

The server provides `/api/search`, `/api/health`, `/llms.txt`, `/robots.txt` and `/sitemap.xml`.
The search endpoint indexes all published MDX locally. Metadata, canonical URLs and structured data
use `https://docs.nayori.ai`, never the application origin.

## Search and API reference

Search is keyboard-accessible through `Command/Ctrl+K`, indexes headings, prose and code, and is
self-hosted so no developer query is sent to a third party. Empty queries, no-result states and
backend failures have explicit accessible UI states.

Fumadocs OpenAPI renders the versioned schema with endpoint descriptions, parameters, responses,
TypeScript types and copyable curl/TypeScript/Python examples. An interactive playground is
enabled only for credential-free read operations. Protected, state-changing or economic
operations show snippets but cannot be executed through a generic documentation proxy. OAuth,
wallet signing and payment authorization remain separate trust boundaries.

## Content ownership and freshness

The portal is the curated public documentation layer. It links to source repositories but does not
render their README files at runtime. Content owners update the relevant MDX alongside product
changes. A manifest records source repo, source path or public endpoint, observed version and last
verification date for SDK, contracts, API and OAuth material.

The OpenAPI sync command accepts either a local file or HTTPS URL, validates it, normalizes it and
writes the snapshot only when explicitly requested. The CI check never mutates files and fails on
schema or generated-page drift. Secrets, invitations, bearer tokens, wallet keys and merchant
credentials are prohibited from content and examples.

## Failure handling

- Documentation builds fail on broken internal links, invalid frontmatter, invalid OpenAPI or
  missing required navigation entries.
- Live service status is labeled with a last-verified date; an unavailable dependency never
  silently becomes a claim of zero activity or readiness.
- The API reference remains readable from the committed snapshot when the API is unavailable.
- Playground actions that are not explicitly allowlisted remain disabled.
- Unknown network or asset combinations fail closed in examples and comparison tables.

## Deployment

The VPS builds `Docs/Dockerfile` from the exact merged source archive. A dedicated Compose service
and internal port are promoted first to a preview hostname, then to `docs.nayori.ai`. Caddy replaces
the current alias to the Web container only after health, canonical metadata, search, representative
guides, OpenAPI reference and mobile QA pass. The previous Caddy route and image remain rollback
artifacts.

No Docker image is built locally.

## Validation

- Unit tests for metadata, status labels, navigation, search source and OpenAPI safety policy.
- `npm run lint`, `npm test`, `npm run typecheck` and production build.
- Link, Markdown/MDX and OpenAPI validation.
- Browser QA at desktop and 390-pixel mobile widths, including keyboard navigation and search.
- HTTP checks for health, canonical URL, sitemap, robots, `llms.txt`, security headers and 404.
- Secret scan and dependency audit with no high-severity findings.
- Mermaid diagrams use explicit Stacks-orange initialization and parse successfully.

## Acceptance criteria

The work is complete only when a new developer can identify the correct integration path, install
and run the SDK read-only quickstart, understand wallet/OAuth/payment boundaries, inspect API and
contract references, search the entire portal and distinguish mainnet features from controlled
testnet commerce without relying on internal project documents.
