#!/bin/sh
# Rebuild the exact reviewed dependency tree before any module can import a mainnet signer.
# Execute only from a fresh detached /private/tmp worktree at the merged reviewed SHA.
set -eu

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

[ -z "${NODE_OPTIONS:-}" ] || fail "NODE_OPTIONS must be empty for mainnet signing"
[ -z "${NODE_PATH:-}" ] || fail "NODE_PATH must be empty for mainnet signing"
[ -z "${NPM_CONFIG_NODE_OPTIONS:-}" ] || fail "NPM_CONFIG_NODE_OPTIONS must be empty for mainnet signing"
[ -z "${npm_config_node_options:-}" ] || fail "npm_config_node_options must be empty for mainnet signing"
unset NODE_OPTIONS NODE_PATH NPM_CONFIG_NODE_OPTIONS npm_config_node_options

[ "${STACKS_NETWORK:-}" = "mainnet" ] || fail "STACKS_NETWORK must explicitly be mainnet"
[ "${SERVICE_FEE_MAINNET_E2E_ACTION:-}" = "execute" ] || fail "Armed E2E action must be execute"
[ -n "${SERVICE_FEE_MAINNET_E2E_REVIEWED_SHA:-}" ] || fail "Reviewed SHA is required"
[ -n "${SERVICE_FEE_MAINNET_E2E_LOCKFILE_SHA256:-}" ] || fail "Reviewed lockfile hash is required"

node_major=$(node -p 'Number(process.versions.node.split(".")[0])')
[ "$node_major" -ge 20 ] || fail "Node.js 20 or newer is required"

root=$(git rev-parse --show-toplevel)
case "$root" in
  /private/tmp/nayori-mainnet-e2e-release-*) ;;
  *) fail "Mainnet E2E signing requires a fresh /private/tmp/nayori-mainnet-e2e-release-* worktree" ;;
esac
[ "$PWD" = "$root" ] || fail "Run from the root of the ephemeral E2E worktree"
[ "${CONFIRM_SERVICE_FEE_MAINNET_E2E_EPHEMERAL_ROOT:-}" = "$root" ] || fail "Ephemeral E2E path is not confirmed"
[ "$(git rev-parse HEAD)" = "$SERVICE_FEE_MAINNET_E2E_REVIEWED_SHA" ] || fail "HEAD differs from reviewed SHA"
[ -z "$(git status --porcelain)" ] || fail "Ephemeral E2E worktree is not clean"
git merge-base --is-ancestor "$SERVICE_FEE_MAINNET_E2E_REVIEWED_SHA" origin/main || fail "Reviewed SHA is not merged to origin/main"

lock_hash=$(shasum -a 256 package-lock.json | awk '{print $1}')
[ "$lock_hash" = "$SERVICE_FEE_MAINNET_E2E_LOCKFILE_SHA256" ] || fail "package-lock.json differs from reviewed hash"

npm ci --ignore-scripts --no-audit --no-fund
[ "$(shasum -a 256 package-lock.json | awk '{print $1}')" = "$lock_hash" ] || fail "Dependency installation changed package-lock.json"
[ -z "$(git status --porcelain)" ] || fail "Dependency installation changed the reviewed tree"

runtime_attestation="ephemeral-npm-ci-ignore-scripts-v1:${SERVICE_FEE_MAINNET_E2E_REVIEWED_SHA}:${lock_hash}:${root}"

exec /usr/bin/env -i \
  PATH="$PATH" \
  STACKS_NETWORK="$STACKS_NETWORK" \
  SERVICE_FEE_MAINNET_E2E_ACTION="$SERVICE_FEE_MAINNET_E2E_ACTION" \
  SERVICE_FEE_MAINNET_E2E_REVIEWED_SHA="$SERVICE_FEE_MAINNET_E2E_REVIEWED_SHA" \
  SERVICE_FEE_MAINNET_E2E_LOCKFILE_SHA256="$SERVICE_FEE_MAINNET_E2E_LOCKFILE_SHA256" \
  SERVICE_FEE_MAINNET_E2E_RUNTIME_ATTESTATION="$runtime_attestation" \
  SERVICE_FEE_MAINNET_E2E_CLIENT_ENV_PATH="${SERVICE_FEE_MAINNET_E2E_CLIENT_ENV_PATH:-}" \
  SERVICE_FEE_MAINNET_E2E_ACTOR_ENV_PATH="${SERVICE_FEE_MAINNET_E2E_ACTOR_ENV_PATH:-}" \
  SERVICE_FEE_MAINNET_E2E_AUTHORITY_ENV_PATH="${SERVICE_FEE_MAINNET_E2E_AUTHORITY_ENV_PATH:-}" \
  SERVICE_FEE_MAINNET_E2E_CAMPAIGN_PATH="${SERVICE_FEE_MAINNET_E2E_CAMPAIGN_PATH:-}" \
  SERVICE_FEE_MAINNET_E2E_STX_RESULT_PATH="${SERVICE_FEE_MAINNET_E2E_STX_RESULT_PATH:-}" \
  SERVICE_FEE_MAINNET_E2E_SBTC_RESULT_PATH="${SERVICE_FEE_MAINNET_E2E_SBTC_RESULT_PATH:-}" \
  SERVICE_FEE_MAINNET_E2E_RESUME="${SERVICE_FEE_MAINNET_E2E_RESUME:-}" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E="$CONFIRM_SERVICE_FEE_MAINNET_E2E" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_DEPLOYER="$CONFIRM_SERVICE_FEE_MAINNET_E2E_DEPLOYER" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_CLIENT="$CONFIRM_SERVICE_FEE_MAINNET_E2E_CLIENT" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_PROVIDER="$CONFIRM_SERVICE_FEE_MAINNET_E2E_PROVIDER" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_EVALUATOR="$CONFIRM_SERVICE_FEE_MAINNET_E2E_EVALUATOR" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_AUTHORITY="$CONFIRM_SERVICE_FEE_MAINNET_E2E_AUTHORITY" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_TREASURY="$CONFIRM_SERVICE_FEE_MAINNET_E2E_TREASURY" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_TOP_UP_MICRO_STX="$CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_TOP_UP_MICRO_STX" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_NETWORK_FEES_MICRO_STX="$CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_NETWORK_FEES_MICRO_STX" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_EPHEMERAL_ROOT="$CONFIRM_SERVICE_FEE_MAINNET_E2E_EPHEMERAL_ROOT" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_CAMPAIGN_PATH="${CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_CAMPAIGN_PATH:-}" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_GLOBAL_LOCK_PATH="${CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_GLOBAL_LOCK_PATH:-}" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_GLOBAL_LOCK_SHA256="${CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_GLOBAL_LOCK_SHA256:-}" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_PATH="${CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_PATH:-}" \
  CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_SHA256="${CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_SHA256:-}" \
  node scripts/run-service-fee-mainnet-e2e-campaign.mjs
