# QA proxy upstream refresh

The QA reverse proxy runs as the long-lived `perkos-knowledge-proxy` container.
Its Caddy configuration sends public Evaluator traffic to the Docker service name
`nayori-qa-evaluator:8080`. Caddy resolves that name when the configuration loads.
A Compose recreate can assign a new IP to the service while Caddy retains the old
upstream address, leaving the new healthy container unreachable through HTTPS.

After every runtime recreate, the release controller will validate the existing
read-only Caddyfile inside the proxy container and reload that same configuration.
It performs the refresh before the existing public HTTPS checks, so a release still
cannot pass based only on internal container health. The controller performs the
same refresh after restoring containers during rollback, before validating the
previous public release.

The controller does not edit Caddy configuration, restart the proxy container, or
change certificates. A validation or reload failure aborts the release and invokes
the established rollback path. Tests assert that validate and reload occur before
the first public check, and that a failed release refreshes the proxy again during
rollback before it can report recovery.
