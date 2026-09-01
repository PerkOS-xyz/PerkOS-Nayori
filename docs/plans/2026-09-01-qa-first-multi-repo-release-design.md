# QA-first multi-repository release design

## Decision

Nayori uses `qa` as the protected integration branch and `main` as the protected production
branch in every participating repository.

The release path is:

```text
feature branch -> pull request to qa -> exact-SHA QA deploy -> QA evidence ->
release/<release-id> -> pull request to main -> production rollout
```

An exact Git commit is the release unit. Images are built only on `perkos-cloud-02`; GitHub
Actions performs source and test gates, sends a Git archive through a restricted SSH command and
requests deployment of that exact SHA. Runtime secrets, Compose state and databases stay on the
VPS.

## Repository participation

| Repository | QA artifact | Production artifact |
| --- | --- | --- |
| `PerkOS-Nayori` | Web and developer-portal images | Web and developer-portal images |
| `PerkOS-Nayori-Agent-SDK` | verified package tarball and consumer smoke | public package release remains a separate explicit action |
| `PerkOS-Nayori-Platform` | API, facilitator and reconciliation-worker image | API, facilitator and worker image |
| `PerkOS-Nayori-OAuth` | OAuth image | OAuth image |
| `PerkOS-Nayori-Evaluator` | autonomous evaluator image | no production evaluator until its separate rollout is approved |

## Trust boundaries

- The SSH identity is dedicated to Nayori releases and has a forced-command allowlist.
- The upload command accepts only a known repository identifier, environment, 40-character SHA
  and matching SHA-256 archive digest.
- Deployments use the external mode-`0600` environment files already present on the VPS.
- The previous Compose file and images are retained until all health checks pass.
- Database migrations run before application replacement and must be idempotent.
- Contract deployment is never triggered by a branch push, pull-request merge or service rollout.
- Mainnet contract runners default to signer-free preflight and require release-specific typed
  confirmations before reading a signer.

## Release evidence

Each QA deployment writes a secret-free receipt containing repository, commit, archive digest,
image names, timestamps, migrations, health checks and result. A production-candidate workflow
will create a release branch only when the receipt for the requested QA SHA is present and passed.

Multi-repository releases use a manifest with one exact SHA per participating repository. A repo
that did not change is omitted; it is not silently advanced.

## Rollback

Service rollback restores the previous Compose file and starts the previous image. Database
migrations must be backward-compatible for the duration of the rollout window. Contract rollback
is impossible; therefore contract activation is a separate, manually confirmed sequence after
source verification and controlled E2E evidence.

## Required verification

Before a production pull request:

1. repository CI and security gates pass on the exact QA SHA;
2. the VPS build and migrations pass;
3. every affected container reaches healthy state;
4. public QA health, discovery, OAuth/JWKS, OpenAPI, x402/MPP challenge and evidence routes pass;
5. the receipt contains no secret and identifies the exact SHA; and
6. any contract change has a signer-free mainnet preflight, but no transaction is broadcast.

