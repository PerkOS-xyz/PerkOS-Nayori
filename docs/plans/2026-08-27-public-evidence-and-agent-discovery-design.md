# Public evidence and agent-discovery completion design

Date: 2026-08-27  
Status: approved for implementation

## Outcome

Expose verifiable Tier B mainnet evidence without inflating adoption metrics, and publish discovery
documents that point agents to the real OAuth and MCP services implemented by the private Nayori
Platform. The public web application remains a read-only presentation layer for evidence; it never
stores partner credentials or signs on behalf of a wallet.

## Evidence model

`/evidence` presents two deliberately separate views:

1. **Total on-chain activity** comes directly from Hiro and contract read-only state.
2. **Verified Milestone 2 evidence** comes from a small versioned manifest whose rows contain only
   public addresses, agent/job IDs, lifecycle transaction IDs, asset, block evidence and an explicit
   `team` or `external-attested` classification.

A wallet is never labeled external from address uniqueness alone. An external classification
requires a privately retained wallet-control attestation and participant consent. The public
manifest contains no name, email, private communication, reimbursement detail or credential.

The page shows progress against the authoritative M2 targets, links every transaction to Hiro
Explorer and distinguishes confirmed completion from created, funded, submitted, rejected or
pending activity. `GET /api/evidence.json` returns the same normalized data for reviewers and
agents. CSV export is generated from the visible verified rows.

The current team-operated M1 agent and completed sBTC job are included as baseline network totals
but are excluded from non-team counts.

## Discovery and score completion

The web origin publishes or proxies only services that exist on `api.nayori.ai`:

- OAuth authorization-server metadata;
- OAuth protected-resource metadata;
- `/auth.md` partner-agent registration instructions;
- MCP Server Card linked to the real Streamable HTTP endpoint;
- updated Link headers, API catalog, AI catalog, Agent Skills and `llms.txt` references.

No placeholder authorization endpoint, OIDC claim or MCP capability is advertised. Commerce
metadata identifies the implemented Stacks x402 quote/settlement workflow and its testnet pilot
boundary rather than pretending a generic EVM mechanism.

DNS-AID remains an operational DNS task after the final HTTPS endpoints are deployed. The required
Route 53 SVCB/HTTPS records and DNSSEC gate are documented outside the repository.

## UI and accessibility

The evidence page uses the current Nayori design system, responsive tables/cards and explicit status
labels. Addresses and txids are shortened visually but remain available in links and machine output.
Loading errors identify the unavailable source and never replace a failed live count with a stale or
fabricated value.

The primary navigation adds `Evidence`. Metadata and Markdown negotiation include a concise evidence
summary and the machine-readable endpoint.

## Testing and rollout

Pure aggregation tests cover team/external separation, deduplication, completed-sBTC counting,
malformed manifests, explorer URLs and progress caps. Route tests cover content types, cache policy
and no private fields. Existing frontend, standards, build and audit gates must remain green.

The web PR deploys only after the Platform endpoints it references are merged and deployed, or keeps
those links feature-gated until then. The final acceptance check is direct endpoint inspection plus
a new public Agent Readiness scan; a score is reported only from the external scanner result.
