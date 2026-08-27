# Agent readiness standards design

Date: 2026-08-27

Historical increment: this design records the truthful PR #72 boundary. It is superseded for
OAuth, MCP, evidence and DNS work by
[`2026-08-27-public-evidence-and-agent-discovery-design.md`](2026-08-27-public-evidence-and-agent-discovery-design.md).

## Goal and boundary

Raise Nayori's machine discoverability with standards that describe capabilities that exist today.
The production baseline is 27/100 in Cloudflare's agent-readiness evaluator. This increment will
not publish OAuth metadata, an MCP Server Card or DNS-AID records because Nayori does not yet
operate those services. It will not change contracts, payment behavior or the approved M1 scope.

## Architecture

The Next.js application will become the canonical discovery hub. It will serve an RFC 9727 API
Catalog for the external quote API, an ARD/ai-catalog manifest, and an Agent Skills v0.2.0 index
with three real Markdown skills: product discovery, on-chain commerce and x402 quote discovery.
Skill content and index digests will derive from one source so integrity cannot drift. The ARD
manifest will link only existing resources and use representative queries for semantic discovery.

Homepage responses will advertise these resources through RFC 8288 Link headers. The HTML head
and robots.txt will also advertise the ARD catalog. robots.txt will state the approved content
policy: AI training is not permitted, while search and real-time AI input are permitted.

A client-only WebMCP registrar will feature-detect the current `document.modelContext` interface
and the older navigator interface used by some scanners. It will register only read-only tools
that return discovery data or canonical navigation URLs. Unsupported browsers will receive no
error and no polyfill. Tool execution will never sign a transaction, access a wallet, handle a
credential or claim settlement.

## Validation

Unit tests will cover catalog structure, ARD identifiers, skill digests, content signals and Link
relations. The production build will be smoke-tested for GET/HEAD status, media types, CORS and
integrity. Existing tests, lint, TypeScript and dependency audit remain required. The external
evaluator will be rerun on the preview before production promotion.
