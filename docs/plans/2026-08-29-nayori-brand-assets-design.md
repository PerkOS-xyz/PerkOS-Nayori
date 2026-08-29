# Nayori brand assets across Web and Docs

## Context

Nayori has approved visual assets for its agent avatar, product banner and PerkOS ownership mark.
The Web App and developer portal still used temporary geometric SVG marks and text-only heroes, so
the production surfaces did not yet express the same product identity used on social channels.

## Decision

Publish the approved PNGs as static files inside each independently built runtime. `Avatar.png`
becomes the canonical public `Logo.png`; `Banner.png` remains the homepage hero image; and
`PerkOS.png` appears as the secondary ownership mark. Headers keep the Nayori name as accessible
HTML and show the PerkOS mark only as supporting identity. The banner supplements rather than
replaces the semantic heading, product explanation and calls to action.

Both runtimes declare the source dimensions and aspect ratio to prevent layout shift. Images are
served unoptimized so the non-root, read-only VPS containers never depend on a writable Next.js
image cache. The source files remain unchanged and the copies are byte-identical.

## Alternatives rejected

- CSS background images make the banner decorative and weaken alt-text/accessibility behavior.
- Base64 or inline image data inflates every HTML response and defeats normal browser caching.
- A shared runtime asset service would remove duplicate files but create an unnecessary deployment
  dependency between the Web App and Docs.

## Verification

Package tests assert that all three PNGs exist and that Web and Docs reference the canonical paths.
Lint, types, unit suites and production builds must pass for both applications. Browser QA must
cover desktop and narrow responsive layouts, readable header identity, uncropped banner rendering,
and unchanged wallet/navigation behavior before the VPS-only rollout.
