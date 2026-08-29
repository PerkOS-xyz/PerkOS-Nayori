# Developer portal read-only cache hardening

## Context

The dedicated Nayori documentation runtime runs as a non-root user with a read-only root
filesystem. Static documentation, search, OpenAPI and machine-readable routes work correctly, but
Next.js attempts to persist newly generated ISR entries for unknown routes. The write fails safely
and the 404 remains correct, yet the runtime emits avoidable `ENOENT` cache warnings. Chrome also
requests `/favicon.ico`, while the portal currently publishes only `/icon.svg`.

## Decision

Use Next.js' stable singular `cacheHandler` interface for server cache operations. The handler keeps
entries in a process-local, bounded LRU map and therefore preserves the immutable container model.
It deliberately avoids Redis or a writable Docker volume: this portal is a single-instance,
documentation-only runtime, its canonical pages are already prerendered, and losing runtime cache
entries on restart is harmless.

The handler is capped at 128 entries, supports tag invalidation, and implements the documented
request-cache reset hook. The existing request proxy permanently redirects `/favicon.ico` to the
Nayori SVG icon so browser discovery no longer creates an application-level 404. The proxy is used
because Next.js reserves the `app/favicon.ico` pathname for a static metadata file.

## Alternatives rejected

- A writable cache volume removes the warnings but weakens the read-only runtime guarantee and adds
  lifecycle/backup concerns for disposable data.
- Filtering all unknown routes in Caddy couples the proxy to the documentation route inventory and
  can silently block newly published pages.
- Ignoring the messages leaves noisy production logs and an avoidable favicon 404.

## Verification

Unit tests cover cache reads, bounded eviction, null deletion, tag invalidation and the favicon
redirect. The normal content, Mermaid, OpenAPI, lint, type, unit and production-build gates remain
mandatory. After merge, the exact GitHub archive must be rebuilt only on the VPS and exercised in a
read-only preview. A request to an unknown route and `/favicon.ico` must not produce a filesystem
write warning before the image is promoted.
