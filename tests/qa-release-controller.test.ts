import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const controllerSource = readFileSync(
  resolve(root, "ops/vps/nayori-qa-release"),
  "utf8",
);
const sha = "6786786786786786786786786786786786786786";
const priorWebSha = "425ab782223f11add68762321dea01c7b26ba540";
const priorPlatformSha = "106a6f2f2e1e3da81873cb8a27afcb21efa83f30";
const priorFacilitatorSha = "4b7187a953aeb55781c2ff69ef95ed0a6137f8c4";
const priorOauthSha = "c06b183d553811ca85466c6cd4ecbbf59577d0a6";
const priorEvaluatorSha = "92b4c37fe82f5e57b2997d6fa330a534ac8a51f3";
const migrationTarget = "/docker-entrypoint-initdb.d/001_initial.sql";
const dirs: string[] = [];

type Compose = {
  name: string;
  services: Record<string, {
    image: string;
    environment?: Record<string, string>;
    env_file?: Array<string | { path: string }>;
    volumes?: string[];
    profiles?: string[];
  }>;
  networks: Record<string, unknown>;
  volumes: Record<string, unknown>;
};

function currentVpsCompose(): Compose {
  return {
    name: "perkos-nayori-qa",
    services: {
      web: {
        image: `perkos-nayori-web-qa:${priorWebSha}`,
        environment: {
          NAYORI_RELEASE_SHA: priorWebSha,
          NEXT_PUBLIC_STACKS_NETWORK: "testnet",
          PRIVATE_TEST_SENTINEL: "must-not-appear-in-xtrace-output",
        },
      },
      docs: {
        image: `perkos-nayori-docs-qa:${priorWebSha}`,
        environment: {
          NAYORI_DOCS_RELEASE: priorWebSha,
          NAYORI_DOCS_ORIGIN: "https://docs.qa.nayori.ai",
        },
      },
      "api-postgres": {
        image: "postgres:16-alpine",
        volumes: ["nayori-qa-api-data:/var/lib/postgresql/data"],
      },
      api: {
        image: `perkos-nayori-platform-qa:${priorPlatformSha}`,
        env_file: ["../secrets/platform.env"],
      },
      "facilitator-postgres": {
        image: "postgres:16-alpine",
        volumes: ["nayori-qa-facilitator-data:/var/lib/postgresql/data"],
      },
      facilitator: {
        image: `perkos-nayori-platform-qa:${priorFacilitatorSha}`,
        env_file: ["../secrets/facilitator.env"],
      },
      "facilitator-worker": {
        image: `perkos-nayori-platform-qa:${priorFacilitatorSha}`,
        env_file: ["../secrets/facilitator.env"],
      },
      "oauth-postgres": {
        image: "postgres:16-alpine",
        volumes: ["nayori-qa-oauth-data:/var/lib/postgresql/data"],
      },
      oauth: {
        image: `perkos-nayori-oauth-qa:${priorOauthSha}`,
        env_file: ["../secrets/oauth.env"],
      },
      "evaluator-postgres": {
        image: "postgres:16-alpine",
        profiles: ["evaluator"],
        volumes: [
          "nayori-qa-evaluator-data:/var/lib/postgresql/data",
          `/opt/perkos-nayori-qa/automation/releases/PerkOS-Nayori-Evaluator-${priorEvaluatorSha}/migrations/001_initial.sql:${migrationTarget}:ro`,
        ],
      },
      evaluator: {
        image: `perkos-nayori-evaluator-qa:${priorEvaluatorSha}`,
        profiles: ["evaluator"],
        env_file: ["../secrets/evaluator.env"],
        volumes: [
          "/opt/perkos-nayori-qa/secrets/evaluator-private-evidence-oauth.json:/run/secrets/evaluator-private-evidence-oauth.json:ro",
        ],
      },
    },
    networks: { qa: {} },
    volumes: {
      "nayori-qa-api-data": {},
      "nayori-qa-facilitator-data": {},
      "nayori-qa-oauth-data": {},
      "nayori-qa-evaluator-data": {},
    },
  };
}

const fakeDocker = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"

if [[ "$1" == compose && "$2" == config && "${"$"}{3:-}" == --help ]]; then
  [[ "${"$"}FAKE_NO_NO_ENV_RESOLUTION" == 1 ]] || echo "      --no-env-resolution   skip service env files"
  exit 0
fi

image_id() {
  printf 'sha256:%s\\n' "$(printf '%s' "$1" | sha256sum | cut -d' ' -f1)"
}

render_yaml() {
  image_for() {
    awk -v service="$1" '
      $0 == "  " service ":" { inside=1; next }
      inside && /^  [A-Za-z0-9_.-]+:/ { inside=0 }
      inside && /^    image:/ { sub(/^    image:[[:space:]]*/, ""); print; exit }
    ' "$FAKE_COMPOSE"
  }
  env_for() {
    awk -v service="$1" -v key="$2" '
      $0 == "  " service ":" { inside=1; next }
      inside && /^  [A-Za-z0-9_.-]+:/ { inside=0 }
      inside && index($0, "      " key ":") == 1 {
        sub("^      " key ":[[:space:]]*", ""); print; exit
      }
    ' "$FAKE_COMPOSE"
  }
  jq -n --arg web "$(image_for web)" --arg docs "$(image_for docs)" \\
    --arg web_release "$(env_for web NAYORI_RELEASE_SHA)" \\
    --arg docs_release "$(env_for docs NAYORI_DOCS_RELEASE)" '
      {services:{
        web:{image:$web,environment:{NAYORI_RELEASE_SHA:$web_release}},
        docs:{image:$docs,environment:{NAYORI_DOCS_RELEASE:$docs_release}}
      }}'
}

render_json() {
  platform_release=$(awk -F= '/^RELEASE_SHA=/{print substr($0, index($0, "=") + 1)}' "$FAKE_PLATFORM_ENV")
  facilitator_release=$(awk -F= '/^RELEASE_SHA=/{print substr($0, index($0, "=") + 1)}' "$FAKE_FACILITATOR_ENV")
  oauth_release=$(awk -F= '/^RELEASE_SHA=/{print substr($0, index($0, "=") + 1)}' "$FAKE_OAUTH_ENV")
  evaluator_release=$(awk -F= '/^RELEASE_SHA=/{print substr($0, index($0, "=") + 1)}' "$FAKE_EVALUATOR_ENV")
  jq --arg platform "$platform_release" --arg facilitator "$facilitator_release" \
    --arg oauth "$oauth_release" --arg evaluator "$evaluator_release" '
    def with_release($service; $suffix; $release):
      if (.services[$service] | type) == "object" and
         ([.services[$service].env_file[]? |
            if type == "string" then . else .path end |
            select(type == "string" and endswith($suffix))] | length) == 1
      then
        .services[$service].environment = (.services[$service].environment // {}) |
        if (.services[$service].environment | has("RELEASE_SHA")) then .
        else .services[$service].environment.RELEASE_SHA = $release end
      else . end;
    with_release("api"; "platform.env"; $platform) |
    with_release("facilitator"; "facilitator.env"; $facilitator) |
    with_release("facilitator-worker"; "facilitator.env"; $facilitator) |
    with_release("oauth"; "oauth.env"; $oauth) |
    with_release("evaluator"; "evaluator.env"; $evaluator)
  ' "$FAKE_COMPOSE"
}

if [[ "$1" == build || "$1" == run || "$1" == exec ]]; then
  exit 0
fi

if [[ "$1" == image && "$2" == inspect ]]; then
  image_id "$5"
  exit 0
fi

if [[ "$1" == inspect ]]; then
  format=$3
  container=$4
  case "$container" in
    nayori-qa-web) service=web ;;
    nayori-qa-docs) service=docs ;;
    nayori-qa-api) service=api ;;
    nayori-qa-facilitator) service=facilitator ;;
    nayori-qa-facilitator-worker) service=facilitator-worker ;;
    nayori-qa-oauth) service=oauth ;;
    nayori-qa-evaluator) service=evaluator ;;
    nayori-qa-evaluator-postgres) service=evaluator-postgres ;;
    *) exit 65 ;;
  esac
  if [[ "$format" == *State.Health* ]]; then
    if [[ "$service" == "${"$"}FAKE_UNHEALTHY_SERVICE" ]]; then
      echo unhealthy
    else
      echo healthy
    fi
    exit 0
  fi
  if [[ "$format" == '{{.Config.Image}}' ]]; then
    jq -er --arg service "$service" '.[$service].tag' "$FAKE_DOCKER_STATE"
    exit 0
  fi
  if [[ "$format" == '{{.Image}}' ]]; then
    jq -er --arg service "$service" '.[$service].id' "$FAKE_DOCKER_STATE"
    exit 0
  fi
  if [[ "$format" == '{{.State.Status}}' ]]; then
    jq -er --arg service "$service" '.[$service].status // "running"' "$FAKE_DOCKER_STATE"
    exit 0
  fi
  if [[ "$format" == '{{.State.Running}}' ]]; then
    jq -r --arg service "$service" '
      .[$service] | if has("running") then .running else true end
    ' "$FAKE_DOCKER_STATE"
    exit 0
  fi
  if [[ "$format" == '{{.RestartCount}}' ]]; then
    jq -er --arg service "$service" '.[$service].restartCount // 0' "$FAKE_DOCKER_STATE"
    exit 0
  fi
  if [[ "$format" == '{{json .Config.Env}}' ]]; then
    jq -cer --arg service "$service" '
      [.[$service].env | to_entries[] | (.key + "=" + .value)]
    ' "$FAKE_DOCKER_STATE"
    exit 0
  fi
  if [[ "$format" == '{{json .Mounts}}' && "$service" == evaluator-postgres ]]; then
    mount=$(jq -er --arg target "${migrationTarget}" '
      .services["evaluator-postgres"].volumes[] |
      select(type == "string" and (split(":")[1] == $target))
    ' "$FAKE_COMPOSE")
    source_path=$(printf '%s' "$mount" | cut -d: -f1)
    jq -cn --arg source "$source_path" --arg target "${migrationTarget}" \
      '[{Source:$source,Destination:$target,RW:false}]'
    exit 0
  fi
  exit 65
fi

[[ "$1" == compose ]] || exit 65
shift
args=("$@")
command_index=-1
command_name=
for ((i=0; i<\${#args[@]}; i++)); do
  case "\${args[$i]}" in
    config|up|run) command_index=$i; command_name="\${args[$i]}"; break ;;
  esac
done
[[ "$command_index" -ge 0 ]] || exit 65

if [[ "$command_name" == config ]]; then
  if printf '%s\\n' "\${args[@]}" | grep -qx -- '--format'; then
    if [[ "$(awk '{sub(/^[[:space:]]*/,""); if(length){print substr($0,1,1); exit}}' "$FAKE_COMPOSE")" == '{' ]]; then
      if printf '%s\\n' "\${args[@]}" | grep -qx -- '--no-env-resolution'; then
        cat "$FAKE_COMPOSE"
      else
        render_json
      fi
    else
      render_yaml
    fi
  else
    first=$(awk '{sub(/^[[:space:]]*/,""); if(length){print substr($0,1,1); exit}}' "$FAKE_COMPOSE")
    [[ "$first" != '{' ]] || jq -e . "$FAKE_COMPOSE" >/dev/null
  fi
  exit 0
fi

if [[ "$command_name" == run ]]; then
  exit 0
fi

services=()
for ((i=command_index+1; i<\${#args[@]}; i++)); do
  [[ "\${args[$i]}" == -* ]] && continue
  services+=("\${args[$i]}")
done
for service in "\${services[@]}"; do
  [[ "$service" == "${"$"}FAKE_STALE_SERVICE" ]] && continue
  if [[ "$(awk '{sub(/^[[:space:]]*/,""); if(length){print substr($0,1,1); exit}}' "$FAKE_COMPOSE")" == '{' ]]; then
    image=$(jq -er --arg service "$service" '.services[$service].image' "$FAKE_COMPOSE")
  else
    image=$(render_yaml | jq -er --arg service "$service" '.services[$service].image')
  fi
  id=$(image_id "$image")
  env_key=
  env_value=
  case "$service" in
    web)
      env_key=NAYORI_RELEASE_SHA
      if [[ "$(awk '{sub(/^[[:space:]]*/,""); if(length){print substr($0,1,1); exit}}' "$FAKE_COMPOSE")" == '{' ]]; then
        env_value=$(render_json | jq -er '.services.web.environment.NAYORI_RELEASE_SHA')
      else
        env_value=$(render_yaml | jq -er '.services.web.environment.NAYORI_RELEASE_SHA')
      fi
      ;;
    docs)
      env_key=NAYORI_DOCS_RELEASE
      if [[ "$(awk '{sub(/^[[:space:]]*/,""); if(length){print substr($0,1,1); exit}}' "$FAKE_COMPOSE")" == '{' ]]; then
        env_value=$(render_json | jq -er '.services.docs.environment.NAYORI_DOCS_RELEASE')
      else
        env_value=$(render_yaml | jq -er '.services.docs.environment.NAYORI_DOCS_RELEASE')
      fi
      ;;
    api|facilitator|facilitator-worker|oauth|evaluator)
      env_key=RELEASE_SHA
      env_value=$(render_json | jq -er --arg service "$service" '.services[$service].environment.RELEASE_SHA')
      ;;
  esac
  if [[ "$service" == "${"$"}FAKE_STALE_IDENTITY_SERVICE" ]]; then
    env_key=
  fi
  next=$(jq -c --arg service "$service" --arg image "$image" --arg id "$id" \
    --arg key "$env_key" --arg value "$env_value" '
      .[$service].tag = $image | .[$service].id = $id |
      .[$service].status = "running" | .[$service].running = true |
      .[$service].restartCount = 0 |
      if $key == "" then . else .[$service].env[$key] = $value end
    ' "$FAKE_DOCKER_STATE")
  printf '%s\\n' "$next" > "$FAKE_DOCKER_STATE"
done
`;

const fakeCurl = `#!/usr/bin/env bash
set -euo pipefail
url=
for argument in "$@"; do url=$argument; done

if [[ "$url" == "${"$"}{FAKE_TRANSIENT_PUBLIC_URL:-}" ]]; then
  attempts_file="${"$"}FAKE_DOCKER_STATE.public-attempts"
  attempts=0
  [[ ! -f "$attempts_file" ]] || attempts=$(cat "$attempts_file")
  if (( attempts < ${"$"}{FAKE_TRANSIENT_PUBLIC_FAILURES:-0} )); then
    printf '%s\n' "$((attempts + 1))" > "$attempts_file"
    exit 22
  fi
fi

release_for() {
  local service=$1 key=$2 release
  release=$(jq -er --arg service "$service" --arg key "$key" '.[$service].env[$key]' "$FAKE_DOCKER_STATE")
  if [[ "$service" == "$FAKE_STALE_PUBLIC_SERVICE" ]]; then
    release=$FAKE_STALE_PUBLIC_SHA
  fi
  printf '%s\n' "$release"
}

mark_worker_restart() {
  local service=$1 marker="${"$"}FAKE_DOCKER_STATE.public-restart-triggered" temp
  [[ "$service" == "$FAKE_RESTART_WORKER_ON_PUBLIC_SERVICE" && ! -e "$marker" ]] || return 0
  temp="${"$"}FAKE_DOCKER_STATE.tmp"
  jq '.["facilitator-worker"].restartCount = 1' "$FAKE_DOCKER_STATE" > "$temp"
  mv "$temp" "$FAKE_DOCKER_STATE"
  : > "$marker"
}

case "$url" in
  https://qa.nayori.ai/api/health)
    release=$(release_for web NAYORI_RELEASE_SHA)
    jq -cn --arg release "$release" '{status:"ok",service:"nayori-web",network:"testnet",release:$release}' ;;
  https://docs.qa.nayori.ai/api/health)
    release=$(release_for docs NAYORI_DOCS_RELEASE)
    jq -cn --arg release "$release" '{service:"nayori-docs",status:"ok",version:$release}' ;;
  https://api.qa.nayori.ai/ready)
    release=$(release_for api RELEASE_SHA)
    jq -cn --arg release "$release" '{status:"ready",service:"nayori-x402-facilitator",database:"available",release:$release}' ;;
  https://api.qa.nayori.ai/supported)
    release=$(release_for api RELEASE_SHA)
    mark_worker_restart api
    if [[ "$FAKE_ROLE_DRIFT_SERVICE" == api ]]; then
      jq -cn --arg release "$release" '{
        service:"nayori-x402-facilitator",release:$release,
        networks:["stacks:2147483648"],roadmap:{activeNetwork:"testnet"},
        quoteIssuanceEnabled:true,paymentVerificationEnabled:true,settlementEnabled:true,
        confirmationEnabled:true,deliveryLedgerEnabled:true,mcpEnabled:false,
        publicResourceEnabled:false,mppResourceEnabled:false
      }'
    else
      jq -cn --arg release "$release" '{
        service:"nayori-x402-facilitator",release:$release,
        networks:["stacks:2147483648"],roadmap:{activeNetwork:"testnet"},
        quoteIssuanceEnabled:true,paymentVerificationEnabled:false,settlementEnabled:false,
        confirmationEnabled:false,deliveryLedgerEnabled:false,mcpEnabled:true,
        publicResourceEnabled:true,mppResourceEnabled:true
      }'
    fi ;;
  https://facilitator.qa.nayori.ai/ready)
    release=$(release_for facilitator RELEASE_SHA)
    jq -cn --arg release "$release" '{status:"ready",service:"nayori-x402-facilitator",database:"available",release:$release}' ;;
  https://facilitator.qa.nayori.ai/supported)
    release=$(release_for facilitator RELEASE_SHA)
    jq -cn --arg release "$release" '{
      service:"nayori-x402-facilitator",release:$release,
      networks:["stacks:2147483648"],roadmap:{activeNetwork:"testnet"},
      quoteIssuanceEnabled:true,paymentVerificationEnabled:true,settlementEnabled:true,
      confirmationEnabled:true,deliveryLedgerEnabled:true,mcpEnabled:false,
      publicResourceEnabled:false,mppResourceEnabled:false
    }' ;;
  https://oauth.qa.nayori.ai/ready)
    release=$(release_for oauth RELEASE_SHA)
    jq -cn --arg release "$release" '{status:"ready",database:"available",release:$release}' ;;
  https://oauth.qa.nayori.ai/supported)
    release=$(release_for oauth RELEASE_SHA)
    jq -cn --arg release "$release" '{
      service:"nayori-oauth",release:$release,stacksNetwork:"testnet",
      partnerRegistrationEnabled:true,agentRegistrationEnabled:true
    }' ;;
  https://evaluator.qa.nayori.ai/healthz)
    jq -cn '{ok:true,service:"nayori-evaluator",version:"0.1.0"}' ;;
  https://evaluator.qa.nayori.ai/readyz)
    jq -cn '{
      ok:true,environment:"qa",network:"testnet",commerceGeneration:"service-fee-v6-v5",
      earnedServiceFeeBps:200,committedEvaluationsEnabled:true,privateEvidenceEnabled:true,
      stxContract:"STTEST.agentic-commerce-v6",sbtcContract:"STTEST.sbtc-commerce-v5",
      evaluatorPrincipal:"STTEST"
    }' ;;
  *) echo "unexpected fake curl URL: $url" >&2; exit 22 ;;
esac
`;

type Harness = {
  base: string;
  controller: string;
  composePath: string;
  digest: string;
  dockerState: string;
  envPath: string;
  receiptPath: string;
  dockerLog: string;
  processEnv: NodeJS.ProcessEnv;
  run: ReturnType<typeof spawnSync>;
};

function shellSingleQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function initialReleaseEnvironment(name: string, compose: Compose | string) {
  if (typeof compose === "string") {
    if (name === "web") return { NAYORI_RELEASE_SHA: "old-web" };
    if (name === "docs") return { NAYORI_DOCS_RELEASE: "old-docs" };
    return {};
  }
  if (name === "web") {
    return {
      NAYORI_RELEASE_SHA: compose.services.web.environment?.NAYORI_RELEASE_SHA ?? "",
    };
  }
  if (name === "docs") {
    return {
      NAYORI_DOCS_RELEASE: compose.services.docs.environment?.NAYORI_DOCS_RELEASE ?? "",
    };
  }
  if (["api", "facilitator", "facilitator-worker"].includes(name)) {
    return {
      RELEASE_SHA: name === "api" ? priorPlatformSha : priorFacilitatorSha,
    };
  }
  if (name === "oauth") return { RELEASE_SHA: priorOauthSha };
  if (name === "evaluator") return { RELEASE_SHA: priorEvaluatorSha };
  return {};
}

function runController(
  repository:
    | "PerkOS-Nayori"
    | "PerkOS-Nayori-Agent-SDK"
    | "PerkOS-Nayori-Platform"
    | "PerkOS-Nayori-OAuth"
    | "PerkOS-Nayori-Evaluator",
  compose: Compose | string,
  staleService = "",
  lockBusy = false,
  unhealthyService = "",
  staleIdentityService = "",
  noNoEnvResolution = false,
  stalePublicService = "",
  stalePublicSha = priorEvaluatorSha,
  roleDriftService = "",
  restartWorkerOnPublicService = "",
  missingReleaseEnv = "",
  signalAfterReceipt = false,
  transientPublicUrl = "",
  transientPublicFailures = 0,
): Harness {
  const sandbox = mkdtempSync(join(tmpdir(), "nayori-qa-controller-"));
  dirs.push(sandbox);
  const base = join(sandbox, "base");
  const incoming = join(base, "automation", "incoming");
  const secrets = join(base, "secrets");
  const ops = join(base, "ops");
  const source = join(sandbox, "source");
  const fakeBin = join(sandbox, "bin");
  for (const dir of [incoming, secrets, ops, source, fakeBin])
    mkdirSync(dir, { recursive: true });

  mkdirSync(join(source, "App"), { recursive: true });
  mkdirSync(join(source, "developer-portal"), { recursive: true });
  mkdirSync(join(source, "migrations"), { recursive: true });
  writeFileSync(join(source, "App", "Dockerfile"), "FROM scratch\n");
  writeFileSync(join(source, "developer-portal", "Dockerfile"), "FROM scratch\n");
  writeFileSync(join(source, "migrations", "001_initial.sql"), "SELECT 1;\n");

  const composePath = join(ops, "compose.qa.yaml");
  writeFileSync(
    composePath,
    typeof compose === "string" ? compose : `${JSON.stringify(compose, null, 2)}\n`,
    { mode: 0o600 },
  );
  const envPath = join(secrets, "evaluator.env");
  writeFileSync(
    envPath,
    missingReleaseEnv === "evaluator" ? "LOG_LEVEL=info\n" : `RELEASE_SHA=${priorEvaluatorSha}\n`,
    { mode: 0o600 },
  );
  const platformEnvPath = join(secrets, "platform.env");
  const facilitatorEnvPath = join(secrets, "facilitator.env");
  const oauthEnvPath = join(secrets, "oauth.env");
  writeFileSync(
    platformEnvPath,
    missingReleaseEnv === "platform" ? "LOG_LEVEL=info\n" : `RELEASE_SHA=${priorPlatformSha}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    facilitatorEnvPath,
    missingReleaseEnv === "facilitator" ? "LOG_LEVEL=info\n" : `RELEASE_SHA=${priorFacilitatorSha}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    oauthEnvPath,
    missingReleaseEnv === "oauth" ? "LOG_LEVEL=info\n" : `RELEASE_SHA=${priorOauthSha}\n`,
    { mode: 0o600 },
  );

  const archive = join(sandbox, "release.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", source, "."]);
  const archiveBytes = readFileSync(archive);
  const digest = createHash("sha256").update(archiveBytes).digest("hex");
  const staged = join(incoming, `${repository}-${sha}-${digest}.tar.gz`);
  writeFileSync(staged, archiveBytes, { mode: 0o600 });

  const controller = join(sandbox, "nayori-qa-release");
  const isolatedController = controllerSource.replace(
    "BASE=/opt/perkos-nayori-qa",
    `BASE=${shellSingleQuote(base)}`,
  );
  expect(isolatedController).not.toBe(controllerSource);
  writeFileSync(controller, isolatedController, { mode: 0o700 });

  const docker = join(fakeBin, "docker");
  writeFileSync(docker, fakeDocker, { mode: 0o700 });
  chmodSync(docker, 0o700);
  const curl = join(fakeBin, "curl");
  writeFileSync(curl, fakeCurl, { mode: 0o700 });
  chmodSync(curl, 0o700);
  const sleep = join(fakeBin, "sleep");
  writeFileSync(sleep, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o700 });
  chmodSync(sleep, 0o700);
  const mv = join(fakeBin, "mv");
  writeFileSync(
    mv,
    `#!/usr/bin/env bash
set -euo pipefail
/bin/mv "$@"
destination=
for argument in "$@"; do destination=$argument; done
if [[ "${"$"}{FAKE_SIGNAL_AFTER_RECEIPT:-0}" == 1 && "$destination" == "$FAKE_RECEIPT_PATH" ]]; then
  kill -TERM "$PPID"
fi
`,
    { mode: 0o700 },
  );
  chmodSync(mv, 0o700);
  const flock = join(fakeBin, "flock");
  writeFileSync(
    flock,
    "#!/usr/bin/env bash\n[[ ${FAKE_FLOCK_BUSY:-0} == 1 ]] && exit 1\nexit 0\n",
    { mode: 0o700 },
  );
  chmodSync(flock, 0o700);
  const dockerLog = join(sandbox, "docker.log");
  writeFileSync(dockerLog, "");
  const dockerState = join(sandbox, "docker-state.json");
  const receiptPath = join(
    base,
    "automation",
    "receipts",
    `${repository}-${sha}.json`,
  );
  const serviceTags = typeof compose === "string"
    ? {
        web: "old-web",
        docs: "old-docs",
      }
    : Object.fromEntries(
        Object.entries(compose.services).map(([name, service]) => [name, service.image]),
      );
  const services = Object.fromEntries(
    Object.entries(serviceTags).map(([name, tag]) => [
      name,
      {
        tag,
        id: `sha256:${createHash("sha256").update(tag).digest("hex")}`,
        env: initialReleaseEnvironment(name, compose),
      },
    ]),
  );
  writeFileSync(dockerState, `${JSON.stringify(services)}\n`);

  const processEnv = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    FAKE_COMPOSE: composePath,
    FAKE_DOCKER_LOG: dockerLog,
    FAKE_DOCKER_STATE: dockerState,
    FAKE_STALE_SERVICE: staleService,
    FAKE_FLOCK_BUSY: lockBusy ? "1" : "0",
    FAKE_UNHEALTHY_SERVICE: unhealthyService,
    FAKE_STALE_IDENTITY_SERVICE: staleIdentityService,
    FAKE_EVALUATOR_ENV: envPath,
    FAKE_PLATFORM_ENV: platformEnvPath,
    FAKE_FACILITATOR_ENV: facilitatorEnvPath,
    FAKE_OAUTH_ENV: oauthEnvPath,
    FAKE_NO_NO_ENV_RESOLUTION: noNoEnvResolution ? "1" : "0",
    FAKE_STALE_PUBLIC_SERVICE: stalePublicService,
    FAKE_STALE_PUBLIC_SHA: stalePublicSha,
    FAKE_ROLE_DRIFT_SERVICE: roleDriftService,
    FAKE_RESTART_WORKER_ON_PUBLIC_SERVICE: restartWorkerOnPublicService,
    FAKE_SIGNAL_AFTER_RECEIPT: signalAfterReceipt ? "1" : "0",
    FAKE_RECEIPT_PATH: receiptPath,
    FAKE_TRANSIENT_PUBLIC_URL: transientPublicUrl,
    FAKE_TRANSIENT_PUBLIC_FAILURES: String(transientPublicFailures),
  };
  const run = spawnSync(
    "bash",
    [controller, "deploy", repository, sha, digest],
    {
      encoding: "utf8",
      env: processEnv,
    },
  );

  return {
    base,
    controller,
    composePath,
    digest,
    dockerState,
    envPath,
    receiptPath,
    dockerLog,
    processEnv,
    run,
  };
}

function verifyRelease(
  harness: Harness,
  repository:
    | "PerkOS-Nayori"
    | "PerkOS-Nayori-Agent-SDK"
    | "PerkOS-Nayori-Platform"
    | "PerkOS-Nayori-OAuth"
    | "PerkOS-Nayori-Evaluator",
) {
  return spawnSync("bash", [harness.controller, "verify", repository, sha], {
    encoding: "utf8",
    env: harness.processEnv,
  });
}

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("QA release controller Compose mutation", () => {
  it("updates the current VPS JSON Web images and exact environment keys", () => {
    const harness = runController("PerkOS-Nayori", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);

    const compose = JSON.parse(readFileSync(harness.composePath, "utf8"));
    expect(compose.services.web.image).toBe(`perkos-nayori-web-qa:${sha}`);
    expect(compose.services.docs.image).toBe(`perkos-nayori-docs-qa:${sha}`);
    expect(compose.services.web.environment.NAYORI_RELEASE_SHA).toBe(sha);
    expect(compose.services.docs.environment.NAYORI_DOCS_RELEASE).toBe(sha);

    const receipt = JSON.parse(readFileSync(harness.receiptPath, "utf8"));
    expect(receipt).toMatchObject({
      schemaVersion: 2,
      repository: "PerkOS-Nayori",
      commit: sha,
      result: "passed",
      verification: {
        desiredComposeImages: true,
        runningContainerImages: true,
        releaseIdentities: true,
        publicReadiness: true,
        publicReleaseIdentity: true,
        workerRuntime: null,
      },
      runtimeImages: {
        "nayori-qa-web": {
          tag: `perkos-nayori-web-qa:${sha}`,
          id: `sha256:${createHash("sha256").update(`perkos-nayori-web-qa:${sha}`).digest("hex")}`,
        },
        "nayori-qa-docs": {
          tag: `perkos-nayori-docs-qa:${sha}`,
          id: `sha256:${createHash("sha256").update(`perkos-nayori-docs-qa:${sha}`).digest("hex")}`,
        },
      },
    });
    const verify = verifyRelease(harness, "PerkOS-Nayori");
    expect(verify.status, verify.stderr).toBe(0);
  });

  it("updates the JSON Evaluator image, release identity and unique migration mount", () => {
    const harness = runController("PerkOS-Nayori-Evaluator", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);

    const compose = JSON.parse(readFileSync(harness.composePath, "utf8"));
    const release = join(
      harness.base,
      "automation",
      "releases",
      `PerkOS-Nayori-Evaluator-${sha}`,
    );
    expect(compose.services.evaluator.image).toBe(`perkos-nayori-evaluator-qa:${sha}`);
    expect(compose.services["evaluator-postgres"].volumes).toContain(
      `${release}/migrations/001_initial.sql:${migrationTarget}:ro`,
    );
    expect(readFileSync(harness.envPath, "utf8")).toBe(`RELEASE_SHA=${sha}\n`);

    const receipt = JSON.parse(readFileSync(harness.receiptPath, "utf8"));
    expect(receipt.runtimeImages).toEqual({
      "nayori-qa-evaluator": {
        tag: `perkos-nayori-evaluator-qa:${sha}`,
        id: `sha256:${createHash("sha256").update(`perkos-nayori-evaluator-qa:${sha}`).digest("hex")}`,
      },
    });
    expect(receipt.migrationMount).toEqual({
      source: `${release}/migrations/001_initial.sql`,
      target: migrationTarget,
      readOnly: true,
    });
    expect(receipt.verification).toMatchObject({
      releaseIdentities: true,
      publicReadiness: true,
      publicReleaseIdentity: null,
      workerRuntime: null,
    });
  });

  it("binds all three Platform services to the exact image and release identity", () => {
    const harness = runController("PerkOS-Nayori-Platform", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);

    const compose = JSON.parse(readFileSync(harness.composePath, "utf8"));
    for (const service of ["api", "facilitator", "facilitator-worker"]) {
      expect(compose.services[service].image).toBe(`perkos-nayori-platform-qa:${sha}`);
    }
    expect(
      readFileSync(join(harness.base, "secrets", "platform.env"), "utf8"),
    ).toBe(`RELEASE_SHA=${sha}\n`);
    expect(
      readFileSync(join(harness.base, "secrets", "facilitator.env"), "utf8"),
    ).toBe(`RELEASE_SHA=${sha}\n`);

    const state = JSON.parse(readFileSync(harness.dockerState, "utf8"));
    for (const service of ["api", "facilitator", "facilitator-worker"]) {
      expect(state[service].env).toEqual({ RELEASE_SHA: sha });
    }
    const receipt = JSON.parse(readFileSync(harness.receiptPath, "utf8"));
    expect(Object.keys(receipt.runtimeImages).sort()).toEqual([
      "nayori-qa-api",
      "nayori-qa-facilitator",
      "nayori-qa-facilitator-worker",
    ]);
    expect(receipt.verification).toMatchObject({
      publicReadiness: true,
      publicReleaseIdentity: true,
      workerRuntime: {
        running: true,
        zeroRestarts: true,
      },
    });
    const verify = verifyRelease(harness, "PerkOS-Nayori-Platform");
    expect(verify.status, verify.stderr).toBe(0);
  });

  it("binds OAuth to the exact image and release identity", () => {
    const harness = runController("PerkOS-Nayori-OAuth", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);
    const compose = JSON.parse(readFileSync(harness.composePath, "utf8"));
    expect(compose.services.oauth.image).toBe(`perkos-nayori-oauth-qa:${sha}`);
    expect(readFileSync(join(harness.base, "secrets", "oauth.env"), "utf8")).toBe(
      `RELEASE_SHA=${sha}\n`,
    );
    const state = JSON.parse(readFileSync(harness.dockerState, "utf8"));
    expect(state.oauth.env).toEqual({ RELEASE_SHA: sha });
    const verify = verifyRelease(harness, "PerkOS-Nayori-OAuth");
    expect(verify.status, verify.stderr).toBe(0);
  });

  it("records public origins and worker runtime as not applicable for SDK verification", () => {
    const harness = runController("PerkOS-Nayori-Agent-SDK", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);
    expect(
      existsSync(harness.receiptPath),
      `${harness.run.stdout}\n${harness.run.stderr}`,
    ).toBe(true);
    const receipt = JSON.parse(readFileSync(harness.receiptPath, "utf8"));
    expect(receipt.runtimeImages).toEqual({});
    expect(receipt.verification).toEqual({
      desiredComposeImages: null,
      runningContainerImages: null,
      releaseIdentities: null,
      publicReadiness: null,
      publicReleaseIdentity: null,
      workerRuntime: null,
    });
    const verify = verifyRelease(harness, "PerkOS-Nayori-Agent-SDK");
    expect(verify.status, verify.stderr).toBe(0);
  });

  it("removes an SDK receipt interrupted after materialization but before its pointer", () => {
    const harness = runController(
      "PerkOS-Nayori-Agent-SDK",
      currentVpsCompose(),
      "",
      false,
      "",
      "",
      false,
      "",
      priorEvaluatorSha,
      "",
      "",
      "",
      true,
    );

    expect(harness.run.status, harness.run.stderr).toBe(143);
    expect(existsSync(harness.receiptPath)).toBe(false);
    expect(
      existsSync(
        join(
          harness.base,
          "automation",
          "receipts",
          "PerkOS-Nayori-Agent-SDK-current.json",
        ),
      ),
    ).toBe(false);
  });

  it("cannot write a passed receipt when the healthy container retains the old image", () => {
    const original = currentVpsCompose();
    const harness = runController("PerkOS-Nayori-Evaluator", original, "evaluator");

    expect(harness.run.status, harness.run.stderr).toBe(65);
    expect(harness.run.stderr).toContain("running image mismatch for nayori-qa-evaluator");
    expect(existsSync(harness.receiptPath)).toBe(false);
    expect(
      JSON.parse(readFileSync(harness.composePath, "utf8")),
      `${harness.run.stdout}\n${harness.run.stderr}`,
    ).toEqual(original);
    expect(readFileSync(harness.envPath, "utf8")).toBe(
      `RELEASE_SHA=${priorEvaluatorSha}\n`,
    );
    const state = JSON.parse(readFileSync(harness.dockerState, "utf8"));
    expect(state.evaluator).toEqual({
      tag: `perkos-nayori-evaluator-qa:${priorEvaluatorSha}`,
      id: `sha256:${createHash("sha256")
        .update(`perkos-nayori-evaluator-qa:${priorEvaluatorSha}`)
        .digest("hex")}`,
      env: { RELEASE_SHA: priorEvaluatorSha },
    });
  });

  it("cannot write a passed receipt when the live release identity stays stale", () => {
    const harness = runController(
      "PerkOS-Nayori-Evaluator",
      currentVpsCompose(),
      "",
      false,
      "",
      "evaluator",
    );

    expect(harness.run.status).not.toBe(0);
    expect(harness.run.stderr).toContain(
      "running release identity mismatch for nayori-qa-evaluator.RELEASE_SHA",
    );
    expect(existsSync(harness.receiptPath)).toBe(false);
    expect(readFileSync(harness.envPath, "utf8")).toBe(
      `RELEASE_SHA=${priorEvaluatorSha}\n`,
    );
  });

  it("fails distinctly when Evaluator rollback cannot restore PostgreSQL health", () => {
    const harness = runController(
      "PerkOS-Nayori-Evaluator",
      currentVpsCompose(),
      "",
      false,
      "evaluator-postgres",
    );

    expect(harness.run.status).toBe(70);
    expect(harness.run.stderr).toContain(
      "QA RELEASE ROLLBACK VERIFICATION FAILED; operator remediation required",
    );
    expect(existsSync(harness.receiptPath)).toBe(false);
  });

  it("rejects current verification when an immutable container image ID drifts", () => {
    const harness = runController("PerkOS-Nayori", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);
    const state = JSON.parse(readFileSync(harness.dockerState, "utf8"));
    state.web.id = `sha256:${"0".repeat(64)}`;
    writeFileSync(harness.dockerState, `${JSON.stringify(state)}\n`);

    const verify = verifyRelease(harness, "PerkOS-Nayori");
    expect(verify.status).not.toBe(0);
    expect(verify.stderr).toContain("current container image binding mismatch");
  });

  it("rejects current verification when a live release identity drifts", () => {
    const harness = runController("PerkOS-Nayori", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);
    const state = JSON.parse(readFileSync(harness.dockerState, "utf8"));
    state.web.env.NAYORI_RELEASE_SHA = priorEvaluatorSha;
    writeFileSync(harness.dockerState, `${JSON.stringify(state)}\n`);

    const verify = verifyRelease(harness, "PerkOS-Nayori");
    expect(verify.status).not.toBe(0);
    expect(verify.stderr).toContain(
      "running release identity mismatch for nayori-qa-web.NAYORI_RELEASE_SHA",
    );
  });

  it("rejects current verification when the facilitator worker has restarted", () => {
    const harness = runController("PerkOS-Nayori-Platform", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);
    const state = JSON.parse(readFileSync(harness.dockerState, "utf8"));
    state["facilitator-worker"].restartCount = 1;
    writeFileSync(harness.dockerState, `${JSON.stringify(state)}\n`);

    const verify = verifyRelease(harness, "PerkOS-Nayori-Platform");
    expect(verify.status).not.toBe(0);
    expect(verify.stderr).toContain(
      "facilitator worker is not stably running with zero restarts",
    );
  });

  it("cannot write a passed receipt when the public origin reports a stale release", () => {
    const original = currentVpsCompose();
    const harness = runController(
      "PerkOS-Nayori",
      original,
      "",
      false,
      "",
      "",
      false,
      "web",
      priorWebSha,
    );

    expect(harness.run.status, harness.run.stderr).toBe(65);
    expect(harness.run.stderr).toContain("public QA origin verification failed: web");
    expect(existsSync(harness.receiptPath)).toBe(false);
    expect(
      JSON.parse(readFileSync(harness.composePath, "utf8")),
      `${harness.run.stdout}\n${harness.run.stderr}`,
    ).toEqual(original);
  });

  it("tolerates a bounded reverse-proxy propagation window", () => {
    const harness = runController(
      "PerkOS-Nayori-Evaluator",
      currentVpsCompose(),
      "",
      false,
      "",
      "",
      false,
      "",
      priorEvaluatorSha,
      "",
      "",
      "",
      false,
      "https://evaluator.qa.nayori.ai/healthz",
      4,
    );

    expect(harness.run.status, harness.run.stderr).toBe(0);
    expect(existsSync(harness.receiptPath)).toBe(true);
    expect(
      readFileSync(`${harness.dockerState}.public-attempts`, "utf8").trim(),
    ).toBe("4");
  });

  it("cannot confuse the API edge with the facilitator execution origin", () => {
    const original = currentVpsCompose();
    const harness = runController(
      "PerkOS-Nayori-Platform",
      original,
      "",
      false,
      "",
      "",
      false,
      "",
      priorEvaluatorSha,
      "api",
    );

    expect(harness.run.status).not.toBe(0);
    expect(harness.run.stderr).toContain("public QA origin verification failed: api-role");
    expect(existsSync(harness.receiptPath)).toBe(false);
    expect(JSON.parse(readFileSync(harness.composePath, "utf8"))).toEqual(original);
  });

  it("restores and verifies split prior Platform releases without conflating their SHAs", () => {
    const original = currentVpsCompose();
    const harness = runController(
      "PerkOS-Nayori-Platform",
      original,
      "",
      false,
      "",
      "",
      false,
      "api",
      priorPlatformSha,
    );

    expect(harness.run.status, harness.run.stderr).toBe(65);
    expect(harness.run.stderr).toContain("public QA origin verification failed: api");
    expect(harness.run.stderr).toContain(
      "QA release rollback restored and verified the previous runtime",
    );
    expect(existsSync(harness.receiptPath)).toBe(false);
    expect(JSON.parse(readFileSync(harness.composePath, "utf8"))).toEqual(original);
    expect(
      readFileSync(join(harness.base, "secrets", "platform.env"), "utf8"),
    ).toBe(`RELEASE_SHA=${priorPlatformSha}\n`);
    expect(
      readFileSync(join(harness.base, "secrets", "facilitator.env"), "utf8"),
    ).toBe(`RELEASE_SHA=${priorFacilitatorSha}\n`);
  });

  it("re-observes the worker after public checks before writing a receipt", () => {
    const original = currentVpsCompose();
    const harness = runController(
      "PerkOS-Nayori-Platform",
      original,
      "",
      false,
      "",
      "",
      false,
      "",
      priorEvaluatorSha,
      "",
      "api",
    );

    expect(harness.run.status, harness.run.stderr).toBe(65);
    expect(harness.run.stderr).toContain(
      "facilitator worker is not stably running with zero restarts",
    );
    expect(existsSync(harness.receiptPath)).toBe(false);
    expect(JSON.parse(readFileSync(harness.composePath, "utf8"))).toEqual(original);
  });

  it("disables inherited xtrace and never echoes resolved Compose secrets", () => {
    const harness = runController("PerkOS-Nayori", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);

    const verify = spawnSync(
      "bash",
      ["-x", harness.controller, "verify", "PerkOS-Nayori", sha],
      { encoding: "utf8", env: harness.processEnv },
    );
    expect(verify.status, verify.stderr).toBe(0);
    expect(`${verify.stdout}${verify.stderr}`).not.toContain(
      "must-not-appear-in-xtrace-output",
    );
    expect(`${verify.stdout}${verify.stderr}`).not.toContain("PRIVATE_TEST_SENTINEL");
  });

  it("rejects a receipt whose repo-specific runtime service set is incomplete", () => {
    const harness = runController("PerkOS-Nayori", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);
    const receipt = JSON.parse(readFileSync(harness.receiptPath, "utf8"));
    delete receipt.runtimeImages["nayori-qa-docs"];
    writeFileSync(harness.receiptPath, `${JSON.stringify(receipt)}\n`);
    const digest = createHash("sha256")
      .update(readFileSync(harness.receiptPath))
      .digest("hex");
    const pointer = join(
      harness.base,
      "automation",
      "receipts",
      "PerkOS-Nayori-current.json",
    );
    writeFileSync(pointer, `${JSON.stringify({
      schemaVersion: 1,
      environment: "qa",
      repository: "PerkOS-Nayori",
      commit: sha,
      receiptSha256: digest,
    })}\n`);

    const verify = verifyRelease(harness, "PerkOS-Nayori");
    expect(verify.status).not.toBe(0);
    expect(verify.stderr).toContain("incomplete runtime service set");
  });

  it("does not let a legacy v1 receipt authorize normal current verification", () => {
    const harness = runController("PerkOS-Nayori", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);
    const legacy = {
      schemaVersion: 1,
      environment: "qa",
      repository: "PerkOS-Nayori",
      commit: sha,
      result: "passed",
    };
    writeFileSync(harness.receiptPath, `${JSON.stringify(legacy)}\n`);
    const digest = createHash("sha256")
      .update(readFileSync(harness.receiptPath))
      .digest("hex");
    const pointer = join(
      harness.base,
      "automation",
      "receipts",
      "PerkOS-Nayori-current.json",
    );
    writeFileSync(pointer, `${JSON.stringify({
      schemaVersion: 1,
      environment: "qa",
      repository: "PerkOS-Nayori",
      commit: sha,
      receiptSha256: digest,
    })}\n`);

    const verify = verifyRelease(harness, "PerkOS-Nayori");
    expect(verify.status).not.toBe(0);
    expect(verify.stderr).toContain("lacks current runtime verification");
  });

  it("never overwrites an existing legacy receipt for the same commit", () => {
    const harness = runController("PerkOS-Nayori", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);
    writeFileSync(harness.receiptPath, `${JSON.stringify({
      schemaVersion: 1,
      environment: "qa",
      repository: "PerkOS-Nayori",
      commit: sha,
      result: "passed",
    })}\n`);
    const legacy = readFileSync(harness.receiptPath, "utf8");

    const retry = spawnSync(
      "bash",
      [harness.controller, "deploy", "PerkOS-Nayori", sha, harness.digest],
      { encoding: "utf8", env: harness.processEnv },
    );
    expect(retry.status).toBe(73);
    expect(retry.stderr).toContain("QA receipt already exists");
    expect(readFileSync(harness.receiptPath, "utf8")).toBe(legacy);
  });

  it("refuses a release when the VPS-wide controller lock is held", () => {
    const harness = runController("PerkOS-Nayori", currentVpsCompose(), "", true);
    expect(harness.run.status).toBe(75);
    expect(harness.run.stderr).toContain("another Nayori QA release operation is active");
    expect(readFileSync(harness.dockerLog, "utf8")).toBe("");
    expect(existsSync(harness.receiptPath)).toBe(false);
  });

  it("fails clearly before release state when Compose lacks the pinned capability", () => {
    const harness = runController(
      "PerkOS-Nayori",
      currentVpsCompose(),
      "",
      false,
      "",
      "",
      true,
    );
    expect(harness.run.status).toBe(69);
    expect(harness.run.stderr).toContain(
      "Docker Compose with config --no-env-resolution support is required",
    );
    expect(existsSync(harness.receiptPath)).toBe(false);
  });

  it("fails closed when the Evaluator migration mount is ambiguous", () => {
    const compose = currentVpsCompose();
    compose.services["evaluator-postgres"].volumes?.push(
      `/opt/ambiguous/migrations/001_initial.sql:${migrationTarget}:ro`,
    );
    const harness = runController("PerkOS-Nayori-Evaluator", compose);

    expect(harness.run.status).not.toBe(0);
    expect(harness.run.stderr).toContain("missing or ambiguous JSON Compose migration mount");
    expect(existsSync(harness.receiptPath)).toBe(false);
    expect(JSON.parse(readFileSync(harness.composePath, "utf8"))).toEqual(compose);
  });

  it("fails before mutation when an exact JSON environment key is missing", () => {
    const compose = currentVpsCompose();
    delete compose.services.docs.environment?.NAYORI_DOCS_RELEASE;
    const harness = runController("PerkOS-Nayori", compose);

    expect(harness.run.status).not.toBe(0);
    expect(harness.run.stderr).toContain(
      "missing or ambiguous JSON Compose environment target: docs.NAYORI_DOCS_RELEASE",
    );
    expect(existsSync(harness.receiptPath)).toBe(false);
    expect(JSON.parse(readFileSync(harness.composePath, "utf8"))).toEqual(compose);
  });

  it("fails closed when a raw JSON image target occurs twice", () => {
    const compose = `${JSON.stringify(currentVpsCompose(), null, 2)}\n`;
    const duplicate = compose.replace(
      `"image": "perkos-nayori-web-qa:${priorWebSha}"`,
      `"image": "perkos-nayori-web-qa:${priorWebSha}",\n      "image": "ambiguous-web"`,
    );
    expect(duplicate).not.toBe(compose);
    const harness = runController("PerkOS-Nayori", duplicate);

    expect(harness.run.status).not.toBe(0);
    expect(harness.run.stderr).toContain(
      "missing or ambiguous JSON Compose image target: web",
    );
    expect(readFileSync(harness.composePath, "utf8")).toBe(duplicate);
    expect(existsSync(harness.receiptPath)).toBe(false);
  });

  it("rejects noncanonical YAML Compose without mutating release state", () => {
    const yaml = `name: perkos-nayori-qa
services:
  web:
    image: old-web
    environment:
      NAYORI_RELEASE_SHA: old-web
  docs:
    image: old-docs
    environment:
      NAYORI_DOCS_RELEASE: old-docs
`;
    const harness = runController("PerkOS-Nayori", yaml);
    expect(harness.run.status).toBe(65);
    expect(harness.run.stderr).toContain("canonical QA Compose must be a JSON object");
    expect(readFileSync(harness.composePath, "utf8")).toBe(yaml);
    expect(existsSync(harness.receiptPath)).toBe(false);
  });

  it("rejects YAML during current verification even for a valid v2 release", () => {
    const harness = runController("PerkOS-Nayori", currentVpsCompose());
    expect(harness.run.status, harness.run.stderr).toBe(0);
    const receipt = readFileSync(harness.receiptPath, "utf8");
    const yaml = `name: perkos-nayori-qa
services:
  web:
    image: perkos-nayori-web-qa:${sha}
    environment:
      NAYORI_RELEASE_SHA: ${sha}
  docs:
    image: perkos-nayori-docs-qa:${sha}
    environment:
      NAYORI_DOCS_RELEASE: ${sha}
`;
    writeFileSync(harness.composePath, yaml, { mode: 0o600 });

    const verify = verifyRelease(harness, "PerkOS-Nayori");
    expect(verify.status).toBe(65);
    expect(verify.stderr).toContain("canonical QA Compose must be a JSON object");
    expect(readFileSync(harness.composePath, "utf8")).toBe(yaml);
    expect(readFileSync(harness.receiptPath, "utf8")).toBe(receipt);
  });
});
