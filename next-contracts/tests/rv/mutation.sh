#!/bin/sh
# Mutation check: injects one bug at a time into a scratch copy of next/ and
# confirms the lifecycle campaign's invariants catch it. The real contracts are
# never modified. Usage (from next/): sh tests/rv/mutation.sh
set -u
here=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
caught=0
total=0

mutate() {
  name=$1 file=$2 old=$3 new=$4
  total=$((total + 1))
  rm -rf "$work/next" && mkdir -p "$work/next"
  cp -R "$here/contracts" "$here/tests" "$here/settings" "$here/package.json" "$work/next/"
  ln -s "$here/node_modules" "$work/next/node_modules"
  python3 - "$work/next/contracts/$file" "$old" "$new" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path).read()
assert s.count(old) >= 1, f"pattern not found in {path}: {old[:60]}"
open(path, "w").write(s.replace(old, new, 1))
PY
  out=$(cd "$work/next" && node tests/rv/lifecycle.mjs --runs 12 --seed 7 2>&1)
  hit=$(printf '%s\n' "$out" | grep -o 'invariant-[a-z-]* returned false' | head -1)
  if [ -n "$hit" ]; then
    caught=$((caught + 1))
    echo "CAUGHT  $name  ($hit)"
  else
    echo "MISSED  $name"
  fi
}

mutate "settlement keeps the escrow entry" nayori-escrow-sbtc.clar \
  "    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job { status: (if approved STATUS_COMPLETED STATUS_REJECTED) }))" \
  "    (map-set jobs job-id (merge job { status: (if approved STATUS_COMPLETED STATUS_REJECTED) }))"

mutate "refund deletes the escrow but pays nothing" nayori-escrow-sbtc.clar \
  "      (try! (pay budget client))))" \
  "      (try! (pay u0 client))))"

mutate "decision recorded without moving the job forward" nayori-escrow-sbtc.clar \
  "    (map-set jobs job-id (merge job { status: STATUS_DECIDED }))" \
  "    (map-set jobs job-id job)"

mutate "withdraw removes the application without refunding" nayori-applications.clar \
  "    (try! (refund (get deposit entry) applicant))
    (map-set applications job-id (without entries applicant))" \
  "    (map-set applications job-id (without entries applicant))"

mutate "applications appended instead of sorted" nayori-applications.clar \
  "(if (and (not (get placed acc)) (> (get deposit (get new acc)) (get deposit entry)))" \
  "(if false"

echo "mutation check: $caught of $total caught"
[ "$caught" -eq "$total" ]
