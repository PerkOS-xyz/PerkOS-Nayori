# Nayori brand assets across Web and Docs

## Context

Nayori has approved visual assets for its agent avatar, documentation banner, Web hero and PerkOS
ownership mark. The initial integration used the wide documentation banner above the Web hero
copy. It worked in Docs but separated the primary Web message from Nayori's avatar and consumed too
much vertical space on the transactional product homepage.

## Decision

Publish the approved PNGs as static files inside each independently built runtime. `Avatar.png`
becomes the canonical public `Logo.png` and `PerkOS.png` appears as the secondary ownership mark.
Docs keeps `Banner.png` as an inline, accessible figure. The Web App uses `Banner-Web.png` as the
decorative hero background: semantic product copy and calls to action sit above its empty left
region while the avatar remains visible on the right. A directional overlay maintains contrast,
with stronger coverage on narrow screens. Headers keep the Nayori name as accessible HTML and show
the PerkOS mark only as supporting identity.

Both runtimes declare the source dimensions and aspect ratio to prevent layout shift. Images are
served unoptimized so the non-root, read-only VPS containers never depend on a writable Next.js
image cache. The Web background has empty alternative text because it is decorative and its full
meaning already exists as HTML in the hero. The source files remain unchanged and the copies are
byte-identical. Both standalone Docker runners explicitly copy `public/`; Next.js standalone output
does not include that directory automatically.

## Alternatives rejected

- Reusing the documentation banner above the Web copy separates identity from the primary message
  and creates an oversized stacked hero.
- Rendering the avatar as a second foreground image duplicates artwork already present inside the
  Web-specific background and makes responsive cropping harder.
- Base64 or inline image data inflates every HTML response and defeats normal browser caching.
- A shared runtime asset service would remove duplicate files but create an unnecessary deployment
  dependency between the Web App and Docs.

## Verification

Package tests assert that each runtime has its intended PNGs, Web references only
`Banner-Web.png`, Docs references `Banner.png`, and both Dockerfiles copy `public/` into their final
standalone images. Lint, types, unit suites and production builds must pass for both applications.
The VPS-only image probes must request every brand asset before preview promotion. Browser QA must
cover desktop and narrow responsive layouts, readable left-side hero content, visible right-side
avatar, readable header identity and unchanged wallet/navigation behavior before production.
