# Enterprise architecture README design

Date: 2026-08-28  
Status: approved for implementation  
Owner: PerkOS

## Goal

Turn the root README into the canonical enterprise entry point for Nayori. A product leader,
developer, security reviewer, infrastructure operator or Stacks ecosystem partner should be able
to understand what Nayori is, which repository owns each responsibility, how the runtime and
on-chain components interact, what is live, and which controls remain fail-closed.

## Audience

1. Enterprise product and engineering teams evaluating agent commerce on Bitcoin/Stacks.
2. External developers integrating `@perkos/agent-sdk` or the HTTP commerce surfaces.
3. Security reviewers assessing custody, authorization, settlement and data boundaries.
4. Security and ecosystem reviewers validating evidence and delivery maturity.
5. PerkOS operators deploying and monitoring the separated Web, API, facilitator and OAuth roles.

## Information architecture

The README will use an Architecture Hub structure:

1. Executive summary and verified status.
2. Problems solved and enterprise capabilities.
3. Four-repository ownership map with public/private visibility.
4. System-context and deployment-topology diagrams.
5. Three primary flows: escrowed jobs, x402 direct payment and MPP USDCx.
6. OAuth/agent identity and wallet-signing separation.
7. On-chain contracts and public service surfaces.
8. Security, persistence, operational and failure-handling controls.
9. Integration paths and developer quickstart.
10. Product maturity, known limitations and evidence without grant-cycle terminology.

Deep endpoint, configuration and implementation details remain in the component repositories.
The root README describes boundaries and links to those sources rather than duplicating every
environment variable or endpoint contract.

## Architectural rules to preserve

- Current contracts and mainnet evidence remain the stable on-chain foundation.
- Direct x402 and MPP settlement are testnet-only until the external review gate closes.
- OAuth authorizes API access but never signs or approves a wallet payment.
- The SDK builds and verifies plans; the wallet or custody provider owns signing.
- The same-origin Web routes strip credentials and proxy only protocol-specific headers.
- Resource-server, facilitator and OAuth state remain isolated by role, database and signing key.
- `broadcast` and `pending` never imply confirmed settlement or permit delivery.
- The README must distinguish implemented capability, production deployment and enterprise
  readiness without using M1/M2 terminology.

## Diagrams

Mermaid diagrams will show:

1. Enterprise system context across clients, four repositories, Stacks/Hiro and PostgreSQL.
2. Escrow lifecycle from agent registration through reputation update.
3. Direct x402/MPP lifecycle from challenge through confirmation-gated delivery.
4. OAuth and wallet-claim lifecycle, explicitly separated from payment authorization.

Every diagram must have a prose explanation so the architecture remains understandable if a
Markdown renderer does not support Mermaid.

Every Mermaid diagram uses the Stacks orange `#FC6432` for borders, lines and signals, with light
orange backgrounds and neutral dark text. Default blue or purple diagram themes are not permitted.

## Validation

- Verify every repository, package, hostname, contract and public route against current source.
- Search the README for stale repository names and contradictory mainnet/testnet claims.
- Render Mermaid syntax through the repository's Markdown toolchain where available; otherwise
  inspect diagram blocks and validate identifiers mechanically.
- Run `git diff --check`, link checks for public URLs, contract tests, Web tests, lint and build.
- Confirm no secret, private runtime value or internal credential is introduced.
- Record the change in the workspace changelog and the Stacks-Nayori Obsidian project notes.
