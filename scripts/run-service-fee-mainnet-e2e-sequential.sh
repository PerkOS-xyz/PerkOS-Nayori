#!/bin/sh
set -eu

# Compatibility entry point. The Node coordinator owns the global lock, aggregate cap,
# manifest and strict STX-then-sBTC sequencing.
exec node scripts/run-service-fee-mainnet-e2e-campaign.mjs
