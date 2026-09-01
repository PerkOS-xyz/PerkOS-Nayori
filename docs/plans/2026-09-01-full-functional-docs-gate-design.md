# Full-functional documentation gate

## Goal

Make the public developer path reproduce Nayori's implemented technical scope before external
onboarding. External adoption, non-team transactions and the external contract audit remain
separate release obligations.

## Decision

The developer portal is part of the technical M2 gate. It must cover public SDK installation,
signer-free quickstarts, STX/sBTC escrow, the autonomous evaluator, appeal/reversal and timeout
semantics, public origins, safety boundaries and known limitations. QA and mainnet capabilities
must be labeled separately.

## Acceptance criteria

- Content validation, OpenAPI validation, diagrams, lint, typecheck, tests and production build pass.
- Search indexes the new autonomous evaluation and appeal terminology.
- `llms.txt`, `llms-full.txt`, OpenAPI and sitemap remain generated.
- Every documented SDK method and contract identifier matches exact released source.
- Documentation never represents controlled internal QA as external adoption or audit evidence.
