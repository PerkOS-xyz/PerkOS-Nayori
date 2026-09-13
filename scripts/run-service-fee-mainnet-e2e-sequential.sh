#!/bin/sh
set -eu

if [ "${STACKS_NETWORK:-}" != "mainnet" ]; then
  echo "STACKS_NETWORK must explicitly be mainnet" >&2
  exit 1
fi

action="${SERVICE_FEE_MAINNET_E2E_ACTION:-preflight}"
case "$action" in
  preflight)
    SERVICE_FEE_MAINNET_E2E_ACTION=preflight \
      SERVICE_FEE_MAINNET_E2E_ASSET=stx \
      node scripts/e2e-service-fee-mainnet.mjs
    SERVICE_FEE_MAINNET_E2E_ACTION=preflight \
      SERVICE_FEE_MAINNET_E2E_ASSET=sbtc \
      node scripts/e2e-service-fee-mainnet.mjs
    ;;
  execute)
    stx_receipt="${SERVICE_FEE_MAINNET_E2E_STX_RESULT_PATH:-}"
    sbtc_receipt="${SERVICE_FEE_MAINNET_E2E_SBTC_RESULT_PATH:-}"
    if [ -z "$stx_receipt" ] || [ -z "$sbtc_receipt" ] || [ "$stx_receipt" = "$sbtc_receipt" ]; then
      echo "Execution requires distinct absolute STX and sBTC external receipt paths" >&2
      exit 1
    fi
    # Strictly serial: sBTC is never started unless STX exits successfully.
    SERVICE_FEE_MAINNET_E2E_ACTION=execute \
      SERVICE_FEE_MAINNET_E2E_ASSET=stx \
      SERVICE_FEE_MAINNET_E2E_RESULT_PATH="$stx_receipt" \
      node scripts/e2e-service-fee-mainnet.mjs
    SERVICE_FEE_MAINNET_E2E_ACTION=execute \
      SERVICE_FEE_MAINNET_E2E_ASSET=sbtc \
      SERVICE_FEE_MAINNET_E2E_RESULT_PATH="$sbtc_receipt" \
      node scripts/e2e-service-fee-mainnet.mjs
    ;;
  *)
    echo "SERVICE_FEE_MAINNET_E2E_ACTION must be preflight or execute" >&2
    exit 1
    ;;
esac
