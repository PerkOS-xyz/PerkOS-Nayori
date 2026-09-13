# QA release controller: JSON Compose safety design

## Incident and invariant

The QA controller built a new Evaluator image while the VPS Compose document was JSON. Its
line-oriented YAML replacement therefore changed neither `services.evaluator.image` nor the
Evaluator migration mount. The existing container remained healthy, so the controller updated
`evaluator.env` and wrote a false `passed` receipt for a release that was not running.

A QA receipt must now mean both of the following are true: the desired image is present in the
validated Compose model before restart, and the healthy container reports that exact tag through
Docker's `.Config.Image` after restart. Health by itself is insufficient.

## Design

The controller detects JSON from the first non-whitespace character and validates its Compose
object with `jq`. JSON updates are structural and atomic: service images, service-specific
environment keys, and the single read-only Evaluator PostgreSQL migration mount are replaced in a
temporary file and renamed into place. Every target must exist exactly once; missing or duplicate
keys/mounts fail closed. The deployed QA topology is canonical JSON; normal deploy and verify reject
YAML rather than retaining a second handwritten mutation parser.

One VPS-wide `flock` serializes deploy and verify operations across all five repositories before
they touch shared Compose, environment, backup or receipt paths. After mutation,
`docker compose config --format json --no-env-resolution` is streamed directly into narrow `jq`
structural postconditions and is the semantic authority for the canonical JSON document. A startup
capability probe fails closed unless the host supports that option; the pinned VPS baseline is
Compose 2.40.3. Release-identity checks separately stream the resolved model into `jq` and emit only
the exact non-secret release key. The controller disables inherited shell xtrace before reading
arguments or Compose state and never stores the full resolved Compose model in a shell variable,
preventing other `env_file` values from reaching a terminal or journal. The
controller checks every desired service image and changed environment value before `up`; the
Evaluator profile additionally checks the exact migration source, target and read-only mode.
After health, each changed runtime must report the desired tag in `.Config.Image` and the immutable
built-image ID in `.Image`. Evaluator PostgreSQL must also expose the exact read-only migration
mount. Its unchanged idempotent migration runs with `psql --single-transaction` and
`ON_ERROR_STOP`; this hotfix introduces no schema migration or database restore mechanism.

Container health alone is not the release boundary. Before a receipt is committed, the controller
queries each repository's public HTTPS origin with bounded timeouts. Web and Docs must report the
exact SHA. Platform API and facilitator must each report the exact SHA, database readiness, Stacks
testnet, and distinct role-specific capabilities so a swapped upstream cannot pass. OAuth must
report the exact SHA, database readiness, testnet, and its registration role. Evaluator's public
readiness endpoint does not expose a release SHA; its public QA/network/role state is therefore
combined with the exact Docker image and live `RELEASE_SHA` checks. The receipt records this
difference explicitly: Evaluator has successful local release identity and public readiness but a
null public release-identity check because that claim is not available from its endpoint.

The facilitator worker intentionally has no HTTP endpoint or Docker healthcheck. It is classified
as running—not healthy—only after two consecutive observations of `State.Status=running`,
`State.Running=true`, and zero restarts. This observation runs after the bounded public checks so a
restart during those requests cannot race a passed receipt. Checks that do not apply, including public origins and the
worker for an SDK-only release, are stored as not applicable rather than as successful booleans.

The receipt advances to schema version 2 and records the complete repository-specific map of
container, tag and immutable image ID. An atomic current-release pointer binds the repository to
the receipt digest. Normal verification accepts only that current pointer and rechecks the exact
Compose model, live container set, health, tags, IDs and Evaluator mount. Historical version-1
receipts remain files but cannot authorize a current promotion. Existing same-commit receipts are
never overwritten silently; an operator must inspect and move an invalid receipt (and matching
pointer, if any) into the private `receipts/invalid/` quarantine before retrying.

The controller traps errors, interruption, termination, hangup and process exit. Before mutation
it captures the prior live tag/ID and release-identity bindings plus the Evaluator mount. A failed
release restores Compose and environment backups, recreates only the affected services, and proves
their prior health, tags, IDs, release identities and mount. Failed rollback returns a distinct
operator-remediation error. A passed
receipt and current pointer are written only after all postconditions pass.

## Verification

Regression tests execute the real controller against fake Docker boundaries and a sanitized copy
of the VPS JSON Compose topology. They cover Web image/environment changes, Evaluator image and
migration-mount changes, missing or ambiguous targets, fail-closed YAML rejection, current pointers,
immutable image-ID drift, complete service sets, lock contention, legacy-receipt quarantine, and
the original failure mode in which Docker keeps the old Evaluator image. Public-origin release
drift, role swaps and facilitator-worker restart drift are also negative gates. The original case must exit
nonzero, restore and verify Compose, `evaluator.env`, the prior tag and image ID, and leave no
passed receipt.
