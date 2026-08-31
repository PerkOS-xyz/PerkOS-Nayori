# Production functional rollout design

## Objective

Promote the latest verified Nayori services and public surfaces without changing immutable
mainnet contract addresses or widening settlement authority. The release must remain reproducible,
observable and reversible.

## Release boundary

- Promote the Platform API, facilitator and worker from one exact source revision and image.
- Promote the OAuth issuer from its exact merged revision and a VPS-built image.
- Generate the developer portal API reference from the production OpenAPI document.
- Publish the current public SDK version and accurate controlled-rollout status.
- Keep x402 and MPP settlement on Stacks testnet; keep the existing mainnet escrow contracts.

## Safety and rollback

Each stateful service receives a mode-600 Compose backup and PostgreSQL custom-format dump before
promotion. Containers must report healthy with zero restarts, public discovery must expose the
expected release, and x402/MPP must return a valid 402 challenge without broadcasting a payment.
The prior manifest and image remain available for immediate rollback.

## Acceptance checks

1. API, facilitator, worker and OAuth run their exact merged revisions.
2. Health, readiness, OAuth metadata and JWKS are public and valid.
3. x402 and MPP return protocol-correct 402 challenges from the same-origin Nayori routes.
4. The OpenAPI snapshot identifies API 0.7.2 and the official current testnet USDCx contract.
5. Web and documentation builds pass their repository gates before deployment.
6. Internal test transactions are not represented as external adoption or revenue.
