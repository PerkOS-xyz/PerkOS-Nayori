#!/bin/sh
# Builds the fuzzing project from the real contracts. Rendezvous 1.x reads the
# invariants from the contract under test, so the generated
# contracts/sbtc-commerce-v5.clar is the deployed source with one test-only
# timing patch (see README.md) and harnesses/sbtc-commerce-v5.tests.clar
# appended. Never edit contracts/ here.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
out="$here/contracts"
real="$root/contracts/sbtc-commerce-v5.clar"
mkdir -p "$out" "$here/settings"
cp "$root/settings/Devnet.toml" "$here/settings/Devnet.toml"
cp "$root/contracts/sip-010-trait.clar" "$out/sip-010-trait.clar"
cp "$root/contracts/mock-sbtc-token.clar" "$out/mock-sbtc-token.clar"
cp "$root/contracts/reputation-registry-v3.clar" "$out/reputation-registry-v3.clar"

# Test-only patch: a 144-block review window, so a decision stays reachable
# between the random burn-block jumps rv mines. Exactly one line may differ.
sed 's/^(define-constant REVIEW_WINDOW_BURN_BLOCKS u12)$/(define-constant REVIEW_WINDOW_BURN_BLOCKS u144)/' \
  "$real" > "$out/sbtc-commerce-v5.clar.tmp"
changed=$(diff "$real" "$out/sbtc-commerce-v5.clar.tmp" | grep -c '^>' || true)
if [ "$changed" != 1 ]; then
  echo "expected exactly one patched line in sbtc-commerce-v5, got $changed" >&2
  rm -f "$out/sbtc-commerce-v5.clar.tmp"
  exit 1
fi
cat "$out/sbtc-commerce-v5.clar.tmp" "$here/harnesses/sbtc-commerce-v5.tests.clar" > "$out/sbtc-commerce-v5.clar"
rm -f "$out/sbtc-commerce-v5.clar.tmp"
