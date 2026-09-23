# Evaluator official migration gate

## Context

The QA release controller already updates a canonical JSON Compose document with `jq`, verifies
the exact image tag and immutable image ID, checks the live release identity, and fails closed
before writing a successful receipt. The Evaluator path still applies only
`migrations/001_initial.sql` directly with `psql`. That bypasses the Evaluator's versioned
`npm run migrate` entrypoint and therefore cannot apply later migrations or maintain the
`schema_migrations` ledger expected by the runtime.

## Decision

Keep the read-only `001_initial.sql` mount because it remains the PostgreSQL bootstrap path for a
new empty volume. Replace the controller's direct SQL replay with the release image's official
one-shot migration command. The one-shot container constructs an admin PostgreSQL URL internally
from the existing Compose-only `POSTGRES_*` environment, sets the fixed least-privilege runtime
role `nayori_evaluator`, and executes `npm run migrate`. The URL is never expanded by the host
shell, written to a receipt, or passed as a host process argument.

The controller continues only when the migration command exits successfully. It then starts the
Evaluator and requires its health/readiness, exact image ID, and exact `RELEASE_SHA`. A migration
failure enters the existing rollback path and cannot produce a passed receipt.

## Alternatives rejected

- Replaying every SQL file with host-side shell loops would duplicate migration ordering,
  checksums, advisory locks, privilege grants, and drift detection already implemented by the
  Evaluator.
- Sourcing the secret env file on the host would give shell semantics to secret values and is not
  acceptable.
- Passing the resolved admin URL on the Docker command line would expose it through process
  inspection.

## Verification

The controller test harness must prove that the official migrator is invoked for an Evaluator
release and that a one-shot migration failure leaves no passed receipt. The complete security
gate and test suite must remain green before the change is deployed.
