# Nayori landing glow and motion design

Date: 2026-08-29  
Status: approved for implementation

## Context

The Nayori homepage has a strong editorial hero and clear enterprise information hierarchy, but
its presentation is mostly static. The PerkOS landing demonstrates a broader motion language:
ambient radial light, slowly moving particles, CTA halos, scroll reveals, parallax and a pinned
cinematic hero. Nayori should inherit the sense of depth and responsiveness without importing the
full PerkOS motion stack or weakening its Bitcoin-commerce focus.

## Decision

Implement the approved **balanced ambient glow** treatment. Preserve the current layout, copy,
brand assets, server-rendered semantic HTML and agent-readable surfaces. Add only progressive
visual enhancement:

- slow orange/copper ambient light behind the hero;
- a restrained breathing halo around the hero frame;
- subtle ember texture that never captures input;
- a stronger but controlled glow on the primary CTA;
- warm edge light and elevation on feature and workflow cards;
- one-time viewport reveals for supporting sections; and
- reduced effects on small screens and when reduced motion is requested.

The color system uses Nayori and Stacks tones: `#FF8A1E`, `#FC6432`, `#F7931A` and `#FFC38A` on
the existing warm-black surfaces.

## Architecture

Keep `App/src/app/page.tsx` as a server component. A small client-only
`LandingMotionController` observes elements marked with `data-nayori-reveal` and sets a visible
attribute once. Content is rendered visible by default; the controller adds an enhancement class
only when JavaScript and `IntersectionObserver` are available. This prevents hidden content for
agents, crawlers, no-JavaScript clients or unsupported browsers.

All glows and motion live in `App/src/app/globals.css`. No new animation library, smooth-scroll
runtime, canvas, video or image asset is added. Decorative layers use `aria-hidden`,
`pointer-events: none` and CSS transforms/opacity only. Existing links, wallet behavior, network
labels and analytics remain unchanged.

## Motion and accessibility contract

- Hero drift and halo cycles run slowly and never move copy or controls.
- Viewport reveals use small vertical travel and staggered delays, then stop permanently.
- Hover effects have matching `focus-visible` treatment.
- `prefers-reduced-motion: reduce` disables animations and transitions and forces revealed
  content visible.
- Mobile reduces blur radius, particle opacity and glow spread to protect rendering cost.
- Color and glow never become the sole carrier of state or meaning.

## Validation

Add source-level regression tests confirming the controller is progressive, reduced-motion CSS is
present, decorative layers cannot capture input, the approved palette is used and the semantic
hero content remains in HTML. Run Web tests, lint, the production build and dependency audit.
Perform Chrome QA at desktop and mobile widths, including scroll, keyboard focus and a reduced
motion emulation where available. Build no Docker image locally. Production rollout must follow
the existing VPS-only preview-to-production process after merge.

## Alternatives not selected

Static shadows alone would not deliver the requested sense of motion. Copying the complete PerkOS
cinematic system would add `motion`, Lenis, sticky scroll choreography and more hydration to a
landing that does not need them. The balanced treatment provides depth while preserving Nayori's
current performance, readability and enterprise tone.
