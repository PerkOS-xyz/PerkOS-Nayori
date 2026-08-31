# QA release promotion

Nayori uses `qa` as a protected promotion pointer, not as a long-lived development branch.

```text
feature/* -> pull request -> main -> reviewed promotion -> qa -> isolated testnet deploy
```

Every deploy must use one immutable release manifest containing the exact 40-character commit for
each component. Images are built only on the VPS from those commits and recorded by digest. SDK QA
consumers use a commit/tarball; the promotion does not publish an npm release.

The public contracts/Web and SDK repositories use GitHub branch protection on `qa`: PR required,
linear history, resolved conversations, no force-push and no deletion, including administrators.
Their reviewed manual workflow is designed to be the only actor allowed to bypass the PR
requirement. It proves the requested SHA belongs to `main`, is a fast-forward from `qa`, reruns all
release gates and pushes that exact commit without force. The first promotion remains blocked
until the repository owner explicitly grants that narrow bypass to the official GitHub Actions
app; do not disable administrator enforcement or substitute a human direct push.
GitHub's current plan does not provide native branch protection for the private Platform, OAuth or
Evaluator repositories. They remain private and must be promoted only by the reviewed manual
workflow; direct pushes are an operational policy violation. Enabling GitHub Pro/Team is the
remaining control needed to make that restriction server-enforced.

## Release gate

1. Every manifest SHA is reachable from the corresponding repository's `main`.
2. All component CI/security gates pass at those exact SHAs.
3. Contracts are Stacks testnet `agentic-commerce-v5` and `sbtc-commerce-v4`; the appeal window is
   exactly 3 Bitcoin burn blocks and all principals are dedicated QA identities.
4. Web, API, facilitator, OAuth, evaluator, database and wallets are isolated from production.
5. `qa.nayori.ai` is visibly marked `QA / TESTNET` and returns `noindex` headers.
6. The full client, provider, evaluator, appeal and exact-settlement E2E passes for STX and sBTC.
7. Receipts are archived outside GitHub without secrets. Internal actors never count as external
   adoption, non-team usage or revenue.

`deployments/qa-release.schema.json` is the machine-readable contract. A concrete manifest is
created only after all referenced PRs are merged, avoiding mutable branch names or circular
self-references.
