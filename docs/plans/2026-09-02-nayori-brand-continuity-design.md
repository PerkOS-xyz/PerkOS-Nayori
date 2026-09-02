# Nayori brand continuity design

## Decision

The institutional product name is **Nayori — PerkOS Stacks Agentic Commerce**. It connects the
public Nayori identity to the original project name and makes PerkOS ownership and the Stacks
ecosystem explicit. **The Bitcoin Commerce Agent** remains the commercial tagline; it explains the
product promise but does not replace the institutional name.

## Naming hierarchy

Navigation and compact UI retain **Nayori** where the full name would reduce readability. The full
institutional name appears in the landing identity line, repository and application READMEs,
developer-portal identity, page metadata, structured data, machine-readable discovery manifests,
evidence metadata and private package descriptions. Descriptive copy may use the natural sentence
“Nayori is the PerkOS agentic commerce platform built on Stacks.”

Contract names, API routes, npm public coordinates and repository names do not change. Those are
stable integration identifiers, not marketing copy. Private workspace package identifiers may use
`perkos-nayori-*` because they are not public compatibility surfaces.

## Verification

Tests assert the exact institutional name, tagline and private package identifiers. Existing
contract/security, App, documentation, lint, type and production-build gates must remain green.
The QA landing is checked at desktop and mobile widths to ensure the longer identity line does not
introduce overflow. Deployment follows the existing exact-SHA QA-first path. Production is promoted
only after the QA receipt and visual review pass; no contract or blockchain transaction is part of
this branding release.
