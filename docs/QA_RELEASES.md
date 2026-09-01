# Nayori QA-first releases

## Branch contract

- `qa` is the protected integration branch and the source of every QA deployment.
- `main` is the protected production branch.
- Feature work targets `qa`; direct pushes remain blocked by repository rules.
- A release branch is created from an exact QA SHA only after the VPS receipt passes.
- Production pull requests target `main` from `release/<release-id>-<component>`.

This policy applies to Web/contracts/docs, Agent SDK, Platform, OAuth and Evaluator. A
multi-repository release records only participating repositories and one immutable SHA for each.

## Automated QA deployment

A push to `qa` or an explicit dispatch of `Deploy exact QA commit` performs:

1. validation that the requested 40-character SHA is contained in `qa`;
2. the complete repository test, type, build, audit and security gate;
3. creation of a Git archive for that exact commit;
4. SHA-256 verification by the restricted VPS upload command;
5. build on `perkos-cloud-02` using external mode-`0600` environment files;
6. idempotent database migrations where applicable;
7. replacement of only the affected QA services;
8. container and public-origin health checks; and
9. a secret-free passed/failed receipt tied to repository, commit and archive digest.

The Agent SDK is staged as a package tarball and tested from a clean consumer on the VPS. It is
not published to npm by this workflow.

## Production candidate

Run `Prepare production candidate from QA` with the exact deployed SHA and a stable release ID.
The workflow checks the VPS receipt before creating the release branch and pull request. Merging
the pull request is the human production approval boundary.

Service rollout promotes the tested source/image through the existing production Compose and
rollback process. Contract broadcast is never part of a branch workflow or service deployment.

## Contract boundary

Testnet contract deployment and E2E runners remain explicitly confirmed commands. Mainnet runners
default to signer-free preflight and read no signer until every release-specific typed confirmation
has passed. A contract deployment does not switch Web, SDK, API or evaluator consumers.

## Rollback and evidence

The deploy controller retains the previous Compose file and images. If migration, startup or
health validation fails, it restores the previous service definition and any release-identity
environment files it changed. Web, Docs, API, facilitator, OAuth and evaluator must report or retain
the exact deployed SHA; an image update with a stale runtime release identifier fails the rollout
gate. Receipts contain no keys, tokens, database URLs or private operational payloads.

Internal/team-operated QA activity is classified as operational evidence and never counted as
external adoption, external-wallet usage or revenue.
