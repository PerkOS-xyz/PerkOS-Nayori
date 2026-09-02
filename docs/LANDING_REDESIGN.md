# Landing redesign — `dex/landing-page`

Art direction pass over the public landing (`/`) plus the shared header and footer.
Nothing in the contract, wallet, escrow, discovery or evidence layers was touched.

> **Please review this branch locally before merging.** Most of what changed is motion,
> pinning and scroll behaviour, none of which shows up in a diff or in a screenshot.
> PerkOS approved the complete visual direction, including Motion, Lenis and the desktop video.
> The integration keeps those choices and adds environment, accessibility, mobile-overflow and
> bundle-budget gates before QA deployment.

```bash
cd App
npm install          # two new dependencies, see below
npm run dev          # http://localhost:3000
```

Worth scrolling on a real phone as well as on desktop: the deck section behaves
differently at each breakpoint.

## Contents

- [What changed](#what-changed)
- [Updated guard tests](#updated-guard-tests)
- [New dependencies](#new-dependencies)
- [What was deliberately preserved](#what-was-deliberately-preserved)
- [Performance](#performance)
- [Brand assets](#brand-assets)
- [Accessibility and motion](#accessibility-and-motion)
- [QA performed](#qa-performed)
- [Not verified](#not-verified)

## What changed

### Page structure

The landing went from a hero plus three stacked grids to an eight-beat sequence:

| Beat | Component | Notes |
| --- | --- | --- |
| Hero | `landing/Hero.tsx` | Full-bleed pinned art with the copy in the left band |
| Live tape | `landing/LiveTicker.tsx` | Configured-network counters as a running tape on the seam |
| The four primitives | `landing/Primitives.tsx` | Registry, escrow, reputation and validation, restyled |
| Two economic models | `landing/ModelsDeck.tsx` | Pinned stage that swaps between escrow and direct payment |
| Enforcement | `landing/Enforcement.tsx` | Six capabilities, each naming its enforcement point |
| Current boundary | `landing/BoundaryLedger.tsx` | What is live, in controlled rollout, and deliberately closed |
| For builders | `landing/Quickstart.tsx` | SDK install with copy-to-clipboard |
| Closing CTA | `landing/FinalCta.tsx` | The art again, cropped close |

All copy is traceable to `README.md` — "Verified product state", "What Nayori provides",
"Enterprise capability matrix" and "Current boundary". No claim was invented for the page.

Everything the previous landing said is still here. The hero headline and its three signals
("Configured for Stacks", "Bitcoin-final settlement", "Verified end-to-end") are unchanged, and
the four primitives keep their original wording — only their presentation follows the new
system.

Two gaps in the protocol description were closed while checking that: capability validation
was missing from the enforcement matrix, and the boundary ledger listed identity, escrow and
reputation as live on mainnet without validation, which `README.md` includes.

### Hero

The three signals under the calls to action — "Configured for Stacks", "Bitcoin-final
settlement", "Verified end-to-end" — are the previous landing's, unchanged. An extra row of
figures was tried there and removed again: two rows of facts under one headline read as the
same thing said twice, and every figure in it already has a home (the contract count in the
boundary ledger, the SDK in the builders section).

The banner is no longer an illustration inside a bordered card; it is the background of a
full-height section, with the copy in the left band and a gradient scrim carrying it. The
section is `sticky`, so the content below scrolls up over it while the art scales into the
cover. A short loop of the same art plays over the still — see [Brand assets](#brand-assets).

### Two economic models

A pinned stage that swaps between the two models rather than listing both. The swap point is
deliberately asymmetric (38% of the runway) so the first change fires early instead of
leaving a third of the scroll with nothing happening.

The stage runs at every viewport, including phones, where the alternative was a column twice
as long:

| Deck section at ≈440px wide | Stacked column | Pinned stage |
| --- | --- | --- |
| Height | 1713px | 1291px |

That is 25% less scrolling for the same content, which is why the stage earns its keep on
phones even more than on desktop.

The pin runway is shorter on phones (`135vh`) than on desktop (`240vh`), and the stage height
was checked against the tallest model so no card is clipped — the usual failure of pinned
stages on small screens.

### Design system

Added to `tailwind.config.js` rather than hand-picked per component:

- **Spacing** on the Fibonacci sequence — `f1` to `f8` (8, 13, 21, 34, 55, 89, 144, 233px).
- **Type scale**, also Fibonacci in px — `micro` 13, `body` 17, `h3` 21, `h2` 34, `display` 55,
  `hero` clamped between 40 and 68.
- **One signature easing**, `ease-signature` (`cubic-bezier(0.16, 1, 0.3, 1)`), used by every
  transition on the page.
- **`brand-350`** (`#FFB36C`), the step the ramp was missing between `300` and `400`.

Colour follows a 60-30-10 split: near-black canvas, dark surfaces, and the accent reserved
for a single primary CTA per view. The orange glow treatment was pulled back to the two CTAs
and the boundary ledger, where it carries meaning.

Fixed along the way: `.btn-primary` carried an indigo drop shadow (`rgba(85,70,255,.8)`) left
over from an earlier palette, underneath an orange button.

### Header and footer

- The header is transparent over the hero art and turns solid once the page scrolls. The
  decorative sBTC badge and the inline "by PerkOS" moved out; the network badge stays,
  because it tells you which chain you are on.
- The footer moved out of `layout.tsx` into `components/SiteFooter.tsx`, with three real link
  columns (Product, Developers, Evidence) and the machine-readable surfaces exposed directly:
  `/llms.txt`, `/api/evidence.json`, `/api/evidence.csv`, `/api/health`.

Both are shared, so every route inherits them. No other route's own layout was changed.

### Responsive

Audited by measurement at phone width: no horizontal overflow at any scroll position, all
touch targets at 40px or more, and the code block scrolls inside its own box instead of
widening the page. Two real bugs were fixed:

- The deck pinned from `md` while its stage layout only existed from `lg`, so between 768px
  and 1023px the stage was pinned with both models still in normal flow — overflowing, with
  one model invisible but still occupying space. Pin and swap now both follow `lg`, and the
  JavaScript gate matches the CSS breakpoint (`useLgUp`).
- `overflow-x-auto` was set on an inline `<code>`, where it does nothing, so a long install
  command widened the page instead of scrolling inside its box.

## Updated guard tests

The tests now follow the hero into `components/landing/Hero.tsx`, verify the approved WebP/video
enhancement, bind environment labels and explorer links to the configured Stacks network, and
exercise the reduced-motion/mobile invariants as source-level release guards.

**1. `landing-effects.test.ts` — semantic hero and runtime invariants**

The assertions follow the landing composition into `components/landing/Hero.tsx`, verify the
headline and approved WebP/video enhancement, and keep the environment, reduced-motion,
responsive-width and bundle-gate requirements under test.

**2. `brand-assets.test.ts` — approved brand assets**

The asset check follows the hero into its component, verifies the WebP poster and alternative
text, confirms the approved source assets remain published, and confirms the Dockerfile still
copies `public/`.

**3. `landing-effects.test.ts` — animation dependency policy**

The former blanket ban is now an explicit allowlist containing only `lenis` and `motion`.
`framer-motion` remains a transitive implementation dependency rather than a direct dependency.
Any other known animation framework fails the test. A separate post-build gate computes the gzip
size of every initial `/page` chunk and fails above **170 KiB**; it also caps the WebP at 100 KiB
and each video encoding at 700 KiB.

## New dependencies

`motion@^13.1.1` and `lenis@^1.3.26`, both in `App/package.json`.

Honest accounting, because the existing check exists for a reason:

- **Cost.** First-load JavaScript on `/` goes from **113 kB to 163 kB**. `LazyMotion` with a
  deferred feature bundle and `strict` mode is already in place; it saves about 6 kB, because
  what the page uses (`useScroll`, `useTransform`, motion values) is the library core and
  cannot be deferred. Lenis loads after hydration in its own chunk.
- **Supply chain.** `motion` pulls `framer-motion` transitively. `npm audit` reports 0
  vulnerabilities with both installed.
- **What they buy.** The scroll-linked hero, the parallax on the closing CTA, and
  reduced-motion detection. The stage swap, the reveals, the tape and the ember field are all
  dependency-free.
- **A dependency-free build of the same design was measured at 116 kB**, 3 kB over the current
  landing. What it loses is Lenis's momentum scroll; everything else is reproducible by hand.
  PerkOS elected to preserve the contributed interaction exactly and enforce the explicit
  allowlist plus bundle budget instead.

## What was deliberately preserved

- **Server rendering.** Every section renders complete in the server HTML, verified with a raw
  `curl`. This is what the original constraint protects: `/llms.txt`, `.well-known/agent.json`,
  the ARD catalogue and the agent-readiness surfaces only mean something if a client that does
  not run JavaScript still reads the page. Every motion enhancement is gated behind a mount
  check that renders the static, visible markup first — a hydration mismatch there silently
  breaks the whole subtree.
- **The evidence pipeline.** The counters still come from `/api/evidence.json` through
  `homeStatsFromSnapshot`, iterating `HOME_TRANSPARENCY_METRICS`, and still degrade to a dash
  when the chain data is not live. The landing has no numbers of its own.
- **Wallet and discovery.** `WalletConnect`, `WebMcpProvider`, the structured data, the
  `talentapp` verification token and every `<link rel>` in `layout.tsx` are unchanged.
- **Brand assets.** The three approved PNGs are untouched in `public/brand/`.

## Performance

| | Before | After |
| --- | --- | --- |
| First Load JS on `/` | 113 kB | 163 kB |
| Route payload for `/` | 1.18 kB | 51.3 kB |
| Hero image transferred | 1526 kB PNG | **82 kB WebP** |
| Hero first paint | black box until the PNG lands | inlined blur placeholder |

The hero is now served as a WebP derivative generated from the approved PNG, 18.7 times
lighter, with a 0.2 kB inlined blur placeholder so the first frame is the art in soft focus
instead of an empty rectangle. `unoptimized` was left in place, so nothing about the
deployment changes.

Still open: `Logo.png` is 1.9 MB and renders at 36px. Fixing it means either dropping
`unoptimized` on that one image, which turns on the image optimizer at runtime, or shipping a
derivative under a new filename. Both reach past a styling change, so it was left alone.

## Brand assets

New files in `public/brand/`:

- `Banner-Web.webp` — the WebP derivative of the approved banner, same image.
- `Banner-Web-loop.mp4` (613 kB) and `Banner-Web-loop.webm` (587 kB) — a subtle 6-second loop
  of the hero art.

The loop was produced from `Banner-Web.png` with Kling 2.1 Master (image-to-video, through
fal.ai): hair drifting and background lights shimmering, with no camera movement and no change
to her features. The usable first three seconds were trimmed and mirrored, so the last frame is
the first one and the loop closes with no visible cut.

It is a strict enhancement: the WebP is the poster and the LCP element, the video mounts only
after hydration, and it never mounts on phones, under reduced motion, or when the connection
asks for less data. If the file is missing or autoplay is refused, the still stays.

## Accessibility and motion

- Every animation is guarded by `prefers-reduced-motion`; with it on, content is fully visible
  and static. The guards were never disabled, including during review.
- Decorative layers (`Embers`, the scrims, the tape's moving track) are `aria-hidden`, and the
  tape carries an `sr-only` list with the same values as text.
- Touch targets are 40px or more, and the mobile menu trigger is 44px.
- The deck's steps are an ordered list and the enforcement matrix is a description list.

## QA performed

Run on the branch as it stands, against the local dev server and a production build, and
re-run after the four primitives and the hero signals were restored.

**Build and static checks**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | QA/testnet production build passes; 31 routes generated |
| `npm test` | 84/84 App tests pass, including environment, reduced-motion and responsive guards |
| `npm run check:bundle` | 160.6 KiB gzip against a 170 KiB limit; forced 1 KiB budget fails closed |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Root contracts + security gate | 124/124 tests; security gate passes |
| Developer portal `npm run verify` | 15/15 tests; OpenAPI, Mermaid, content, lint, types and build pass |

**Every route still serves, with the shared header and footer**

`/`, `/agents`, `/jobs`, `/activity`, `/evidence`, `/dashboard`, `/search`, `/stats` and
`/analytics` all return 200, and each one carries the wallet control and the new footer.
`/agents` and `/evidence` were also opened in a browser: headings render, no console errors,
no horizontal overflow.

**Machine-readable surfaces are untouched**

`/api/evidence.json`, `/api/health`, `/llms.txt`, `/.well-known/agent.json`, `/robots.txt`,
`/sitemap.xml`, `/x402.json` and `/openapi.json` all return 200 with content. The
`SoftwareApplication` structured data, the `talentapp` verification token and the discovery
`<link rel>` tags are still present in the served HTML.

**Server rendering**

Checked with a raw `curl`, with no JavaScript executed: the hero copy, the live counter
labels, both economic models with all their steps, the enforcement rows, the boundary ledger,
the SDK command and the closing CTA are all present in the server HTML.

**Content carried over from the previous landing**

Checked string by string in the served HTML: the three hero signals, the four primitive
titles with their descriptions, "proof hashes", the new "Capability validation" enforcement
row and the corrected boundary ledger are all present.

**Live data**

The counters resolve against the configured Stacks network through `/api/evidence.json` and
render the current values, falling back to a dash when the snapshot is not live.

**Responsive**

Chrome measurements against the QA/testnet production build report zero horizontal overflow at
320, 360, 390, 440 and 1440 CSS pixels. The testnet label and testnet explorer URL follow the
configured environment, the video stays absent on mobile and mounts on desktop, and the code
guard confirms that reduced-motion mode uses the complete stacked document instead of hiding the
direct-payment model.

## Not verified

Stated plainly so nobody assumes otherwise:

- **Scroll-triggered reveals were not visually confirmed.** They were checked by measuring
  computed styles and by confirming the compiled CSS, but browsers freeze
  `IntersectionObserver` in background tabs, so the entrances need a human looking at a
  foreground window.
- Physical-device testing remains a QA acceptance step; automated and Chrome validation cover the
  production build at the listed CSS viewports before deployment.
