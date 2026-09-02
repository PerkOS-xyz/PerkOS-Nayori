# Modern landing integration design

## Decision

Nayori will preserve the complete visual direction contributed in PR #114: the full-bleed hero,
Motion transitions, Lenis scrolling, animated desktop loop, live evidence tape, two-model scroll
sequence, expanded footer and current-boundary presentation. The integration changes only the
engineering needed to make that experience safe across QA and production.

## Environment and data integrity

Every network-specific label and explorer link must derive from the same validated constants used
by contract reads. QA must identify Stacks testnet and its `ST...` deployer; production must identify
Stacks mainnet and its `SP...` deployer. Landing metrics remain sourced exclusively from
`/api/evidence.json`; no independent counters are introduced.

## Responsive and accessibility behavior

The design must fit 320, 360, 390 and 440 CSS-pixel phones without document-level horizontal
overflow. Long SDK commands may scroll only inside their code surface. With
`prefers-reduced-motion: reduce`, the hero and atmospheric layers become static and the two economic
models render as a normal stacked document rather than a pinned stage. When staging is active, the
inactive model is hidden from assistive technology as well as visually.

## Performance policy

Motion and Lenis are approved dependencies for this experience. The former blanket dependency ban
is replaced by an explicit animation-dependency allowlist and a production-build budget. The `/`
route may not exceed 170 kB First Load JS without an explicit maintainer decision. The optimized
WebP remains the LCP/poster asset; the approximately 600 kB loop remains desktop-only and is disabled
for reduced-motion or data-saving clients.

## Verification and release

CI must be fully green: App tests, lint, production build, dependency audit and bundle budget.
Browser QA covers environment labels, 320/360/390/440 widths, desktop, reduced-motion behavior and
shared routes. The feature targets protected `qa`, deploys by exact SHA, and reaches `main` only
through the established QA production-candidate workflow. Contract broadcasts and economic
transactions are outside this visual release.
