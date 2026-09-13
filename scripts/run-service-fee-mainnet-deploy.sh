#!/bin/sh
# Rebuild the reviewed dependency tree before any Node process can import the
# Stacks signing runtime. Execute only from a fresh detached worktree in
# /private/tmp created from the exact merged main SHA.
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
[ "${SERVICE_FEE_MAINNET_ACTION:-}" = "deploy" ] || fail "Armed action must be deploy"
[ -n "${SERVICE_FEE_MAINNET_REVIEWED_SHA:-}" ] || fail "Reviewed SHA is required"
[ -n "${SERVICE_FEE_MAINNET_LOCKFILE_SHA256:-}" ] || fail "Reviewed lockfile hash is required"
[ -n "${SERVICE_FEE_MAINNET_STATE_DIR:-}" ] || fail "External campaign-state directory is required"

node_major=$(node -p 'Number(process.versions.node.split(".")[0])')
[ "$node_major" -ge 20 ] || fail "Node.js 20 or newer is required"

root=$(git rev-parse --show-toplevel)
case "$root" in
  /private/tmp/nayori-mainnet-release-*) ;;
  *) fail "Mainnet signing requires a fresh /private/tmp/nayori-mainnet-release-* worktree" ;;
esac
[ "$PWD" = "$root" ] || fail "Run from the root of the ephemeral release worktree"
[ "${CONFIRM_SERVICE_FEE_MAINNET_EPHEMERAL_ROOT:-}" = "$root" ] || fail "Ephemeral worktree path is not confirmed"
[ "$(git rev-parse HEAD)" = "$SERVICE_FEE_MAINNET_REVIEWED_SHA" ] || fail "HEAD differs from reviewed SHA"
[ -z "$(git status --porcelain)" ] || fail "Ephemeral release worktree is not clean"
git merge-base --is-ancestor "$SERVICE_FEE_MAINNET_REVIEWED_SHA" origin/main || fail "Reviewed SHA is not merged to origin/main"

lock_hash=$(shasum -a 256 package-lock.json | awk '{print $1}')
[ "$lock_hash" = "$SERVICE_FEE_MAINNET_LOCKFILE_SHA256" ] || fail "package-lock.json differs from reviewed hash"

# npm ci removes any existing node_modules first. Lifecycle scripts are disabled;
# package tarball integrity is verified against package-lock.json.
npm ci --ignore-scripts --no-audit --no-fund

[ "$(shasum -a 256 package-lock.json | awk '{print $1}')" = "$lock_hash" ] || fail "Dependency installation changed package-lock.json"
[ -z "$(git status --porcelain)" ] || fail "Dependency installation changed the reviewed tree"

runtime_attestation="ephemeral-npm-ci-ignore-scripts-v1:${SERVICE_FEE_MAINNET_REVIEWED_SHA}:${lock_hash}:${root}"

exec /usr/bin/env -i \
  PATH="$PATH" \
  STACKS_NETWORK="$STACKS_NETWORK" \
  SERVICE_FEE_MAINNET_ACTION="$SERVICE_FEE_MAINNET_ACTION" \
  SERVICE_FEE_MAINNET_REVIEWED_SHA="$SERVICE_FEE_MAINNET_REVIEWED_SHA" \
  SERVICE_FEE_MAINNET_LOCKFILE_SHA256="$SERVICE_FEE_MAINNET_LOCKFILE_SHA256" \
  SERVICE_FEE_MAINNET_RUNTIME_ATTESTATION="$runtime_attestation" \
  SERVICE_FEE_MAINNET_TREASURY_ADDRESS="$SERVICE_FEE_MAINNET_TREASURY_ADDRESS" \
  SERVICE_FEE_MAINNET_DEPLOYER_ENV_PATH="$SERVICE_FEE_MAINNET_DEPLOYER_ENV_PATH" \
  SERVICE_FEE_MAINNET_TREASURY_ATTESTATION_PATH="$SERVICE_FEE_MAINNET_TREASURY_ATTESTATION_PATH" \
  SERVICE_FEE_MAINNET_RECEIPT_PATH="$SERVICE_FEE_MAINNET_RECEIPT_PATH" \
  SERVICE_FEE_MAINNET_STATE_DIR="$SERVICE_FEE_MAINNET_STATE_DIR" \
  CONFIRM_SERVICE_FEE_MAINNET="$CONFIRM_SERVICE_FEE_MAINNET" \
  CONFIRM_SERVICE_FEE_MAINNET_DEPLOYER="$CONFIRM_SERVICE_FEE_MAINNET_DEPLOYER" \
  CONFIRM_SERVICE_FEE_MAINNET_AUTHORITY="$CONFIRM_SERVICE_FEE_MAINNET_AUTHORITY" \
  CONFIRM_SERVICE_FEE_MAINNET_TREASURY="$CONFIRM_SERVICE_FEE_MAINNET_TREASURY" \
  CONFIRM_SERVICE_FEE_MAINNET_TREASURY_ATTESTATION_PATH="$CONFIRM_SERVICE_FEE_MAINNET_TREASURY_ATTESTATION_PATH" \
  CONFIRM_SERVICE_FEE_MAINNET_RECEIPT_PATH="$CONFIRM_SERVICE_FEE_MAINNET_RECEIPT_PATH" \
  CONFIRM_SERVICE_FEE_MAINNET_STATE_DIR="$CONFIRM_SERVICE_FEE_MAINNET_STATE_DIR" \
  CONFIRM_SERVICE_FEE_MAINNET_MAX_FEES_MICRO_STX="$CONFIRM_SERVICE_FEE_MAINNET_MAX_FEES_MICRO_STX" \
  CONFIRM_SERVICE_FEE_MAINNET_EPHEMERAL_ROOT="$CONFIRM_SERVICE_FEE_MAINNET_EPHEMERAL_ROOT" \
  node scripts/deploy-service-fee-mainnet.mjs
