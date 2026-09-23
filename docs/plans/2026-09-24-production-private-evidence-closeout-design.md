# Production private-evidence closeout design

## Objective

Remove the final reproducibility gap from Nayori's production private-evidence rollout without
publishing the VPS Caddyfile, runtime topology, credentials or internal evidence. The application
code is already merged and deployed by exact commit. The missing public artifact is the narrow
edge policy that lets the three implemented private-evidence POST operations reach the Platform
API while every other unsupported POST remains blocked.

## Design

The repository owns a secret-free Caddy fragment under `ops/vps/caddy/`. Operators import it
inside the private `api.nayori.ai` site block. The fragment allowlists only `prepare`, `complete`
and `download`, plus the pre-existing quote and MCP routes. It deliberately avoids a wildcard, a
reverse-proxy target and any environment-specific credential or filesystem path. The complete
Caddyfile, Compose manifests, secrets and database evidence remain private operational state.

The deployment runbook requires validation against the complete private Caddy configuration,
backup before replacement, atomic reload and a public negative test. A request without OAuth to
`download` must reach the application and return `403` with `Cache-Control: no-store`; `404`
indicates that the edge policy intercepted the request, while success would be a security failure.
The existing API still performs all authentication, wallet binding, scope and job-role checks.

## Verification and failure handling

A Vitest regression reads the public fragment and requires the exact route set, fail-closed 404
fallback and absence of a private-evidence wildcard or embedded proxy/credential material. The
normal repository test and security gates run before merge. Production reload uses the validated
fragment already active on the VPS; if Caddy validation or reload fails, the operator restores the
retained prior file. No contract call, signer, payment or blockchain transaction is part of this
closeout.
