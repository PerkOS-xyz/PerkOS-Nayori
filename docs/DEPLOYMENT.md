# PerkOS deployment guide

## Branch and release model

Every Nayori repository uses `qa` as its protected integration branch and `main` as its protected
production branch. Feature pull requests target `qa`. Run the complete repository gate and initiate
the approved deployment from the operator Mac: upload the exact reviewed Git archive through the
restricted Nayori deploy identity and build the image on the VPS. GitHub-hosted runners do not
have the required firewall access; a merge or passing CI alone is not a deployment receipt.
Do not build deployment images locally. Only a SHA with a passed VPS receipt may create a `release/<release-id>`
branch and pull request to `main`.

Contract transactions are excluded from both branch workflows. Contract promotion always begins
with a signer-free preflight and requires a separately authorized, typed-confirmation command.
See [`QA_RELEASES.md`](QA_RELEASES.md) for the operational sequence and
[`the release design`](plans/2026-09-01-qa-first-multi-repo-release-design.md) for trust boundaries.

### QA controller receipts and quarantine

The VPS controller serializes all repositories with one host-wide lock. A successful runtime
receipt binds the exact commit to the complete container set, SHA-derived image tags, immutable
Docker image IDs and an authoritative current-release pointer. `verify` rechecks that live state;
an older receipt is historical evidence and cannot authorize promotion after a newer deployment.
The controller force-disables inherited shell tracing and streams Compose output only into narrow
postconditions; do not wrap it in tooling that logs Compose or environment-file contents. The VPS
runtime must provide Docker Compose 2.40.3 or newer with `config --no-env-resolution`; the controller
checks this capability before reading release state and fails closed after a host downgrade.
Before committing a receipt it also verifies the affected public HTTPS readiness and capability
endpoints with bounded timeouts and exact release identities where those endpoints expose one.
Platform checks distinguish the API edge from the facilitator execution role. The facilitator
worker has no health endpoint and must remain `running` with zero restarts across two observations;
the controller does not describe that as application health. Non-applicable receipt checks remain
explicitly null rather than being reported as successful.

The controller never overwrites a receipt for the same repository and commit. If an interrupted or
superseded controller produced an invalid receipt, inspect the live Compose model and containers
first, then move—not delete—the receipt into the private VPS quarantine. Move the current pointer
only when its `commit` is the same invalid commit. For example, in a root operator session:

```bash
NAYORI_QA_REPO=PerkOS-Nayori-Evaluator
NAYORI_QA_SHA=0123456789abcdef0123456789abcdef01234567
NAYORI_QA_RECEIPTS=/opt/perkos-nayori-qa/automation/receipts
sudo install -d -m 700 "$NAYORI_QA_RECEIPTS/invalid"
sudo mv "$NAYORI_QA_RECEIPTS/$NAYORI_QA_REPO-$NAYORI_QA_SHA.json" \
  "$NAYORI_QA_RECEIPTS/invalid/$NAYORI_QA_REPO-$NAYORI_QA_SHA.invalid.json"
if sudo jq -e --arg sha "$NAYORI_QA_SHA" '.commit == $sha' \
  "$NAYORI_QA_RECEIPTS/$NAYORI_QA_REPO-current.json" >/dev/null; then
  sudo mv "$NAYORI_QA_RECEIPTS/$NAYORI_QA_REPO-current.json" \
    "$NAYORI_QA_RECEIPTS/invalid/$NAYORI_QA_REPO-current-$NAYORI_QA_SHA.invalid.json"
fi
```

Record the reason and observed live tag/image ID in the private incident evidence. Do not copy
Compose files, environment values or credentials into GitHub. A retry must then create a new
version-2 receipt and current pointer through the normal controller.

## Production

Changing `NEXT_PUBLIC_*` values only at runtime is insufficient: the Web embeds them at build
time. The active source defaults and coordinated QA build select the deployed v6/v5 service-fee
generation. Follow [the consumer release record](QA_FEE_CONSUMERS.md) for compatibility boundaries.

PerkOS is deployed on Stacks mainnet under:

`SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH`

The production frontend is [nayori.ai](https://nayori.ai). The historical PerkOS URL remains a
compatibility entry point.

The current product stack contains:

- `agent-registry`
- `validation-registry`
- `sip-010-trait`
- `reputation-registry-v3`
- `agentic-commerce-v6` for STX escrow, autonomous decisions and earned service fees
- `sbtc-commerce-v5` for sBTC escrow, autonomous decisions and earned service fees

The prior v5/v4, v4/v3 and v2 generations remain immutable historical evidence and are not
selected for new jobs.

## Historical bootstrap deployment

The original bootstrap command is guarded, source-aware and resumable. It skips an existing
contract only when its on-chain source exactly matches the reviewed local source. It
aborts if a contract name already contains different code.

Keep the signer file outside version control:

```env
DEPLOYER_ADDRESS=SP...
DEPLOYER_PRIVATE_KEY=...
```

Then run:

```bash
MAINNET_ENV_PATH=/absolute/path/to/.env.mainnet \
CONFIRM_PERKOS_MAINNET_DEPLOY=yes \
npm run deploy:bootstrap:legacy-v2:mainnet
```

The script:

1. validates that the private key derives the configured mainnet address;
2. compares all six contract sources against mainnet;
3. checks the available STX balance and maximum configured fees;
4. deploys only missing current contracts, one confirmation at a time;
5. configures canonical mainnet sBTC; and
6. authorizes both historical escrow contracts on `reputation-registry-v2`.

A secret-free receipt is written to `/tmp/perkos-mainnet-promotion.json`.

## Independent verification

No wallet or private key is needed:

```bash
npm run verify:mainnet
```

This pins and compares exact local/on-chain source hashes, verifies owners and pending roles,
confirms canonical sBTC, both reputation allowlist entries, the 12/144 windows, the distinct appeal
authority, the attested treasury and 200-basis-point policy, then reads current agent and active
v6/v5 job counts. It has no signer or broadcast path.

## Active earned-service-fee release

`agentic-commerce-v6` and `sbtc-commerce-v5` were deployed and initialized on Stacks mainnet from
exact reviewed merge `887ee9b01d5a880373aa868970e0ff83a6f6731a`. Seven transactions confirmed
`(ok true)` in Stacks blocks `8978368` through `8978385`; the required two-block finality depth was
observed. The source hashes are `8eb55ecc…f40a7b2` and `13256797…052f53`. Both contracts use
`reputation-registry-v3`, review window 12, appeal window 144, appeal authority
`SP2R584GC8W2A921080TY8CQ8P1GZ6JNXYXS65DA6`, treasury
`SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8`, 200 basis points and canonical mainnet sBTC.

New Web builds select this generation. Existing v5/v4 jobs remain readable through explicit
contract overrides and preserve their original no-fee economics. Contract deployment, consumer
deployment and controlled mainnet E2E are separate receipts; none counts as external adoption,
externally earned revenue or an independent audit.

The current generation has its own signer-free preflight and guarded E2E alias:

```bash
STACKS_NETWORK=mainnet \
SERVICE_FEE_MAINNET_E2E_ACTION=preflight \
SERVICE_FEE_MAINNET_E2E_REVIEWED_SHA=<exact-clean-reviewed-sha> \
npm run preflight:e2e:autonomous:mainnet
```

The wrapper preflights STX and then sBTC. It verifies v6/v5 sources, roles, 12/144 windows, treasury,
200 basis points, canonical sBTC and reputation allowlists without opening signer files. The
execution procedure, distinct role files, typed cap and receipt requirements are frozen in
[the mainnet service-fee runbook](MAINNET_SERVICE_FEE_RUNBOOK.md). Never use the legacy v5/v4
aliases for a current-generation canary.

## Historical versioned escrow releases

The repository retains `reputation-registry-v3`, `agentic-commerce-v5` and `sbtc-commerce-v4` as
the immutable pre-fee generation. It introduced the 12-block evaluator window, explainable decisions
and appeals. The preceding v4/v3 generation was first deployed on Stacks testnet under
`ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5` from exact merge
`b15544d601bd4e49610be854f7ad33a0af90c0a7`, then promoted on mainnet from exact merge
`670d23abe78051cfb3963228650fed5089d6827c`.
The earlier immutable v3/v2 generation remains deployed only on testnet at 144 blocks as
historical evidence. The testnet deployment script has no mainnet code path and refuses to read credentials unless the
network and confirmation are both explicit.

The active PoX-5 testnet sBTC principal is
`SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token`. The older `ST1F7...` principal is retained
only in frozen historical sources/evidence. Mainnet remains `SM3VD...` and is unaffected.

### Historical autonomous evaluator/appeal generation

`agentic-commerce-v5` and `sbtc-commerce-v4` were fully exercised in isolated Stacks testnet QA
with a three-burn-block appeal policy before mainnet promotion. Mainnet uses the same frozen
sources with a 144-burn-block appeal policy and a dedicated human appeal authority.

The dedicated v5/v4 mainnet runner defaults to a signer-free preflight. It freezes the reviewed
source hashes, requires an explicit appeal-authority principal separate from the deployer, checks
mainnet source occupancy, nonce, mempool and maximum fees, and creates no transaction:

```bash
STACKS_NETWORK=mainnet \
AUTONOMOUS_ESCROW_MAINNET_APPEAL_AUTHORITY=SP... \
npm run preflight:autonomous:legacy-v5-v4:mainnet
```

The deploy action additionally requires the exact strings
`CONFIRM_AUTONOMOUS_ESCROW_MAINNET_DEPLOY=deploy-v5-v4-mainnet`, the exact deployer confirmation,
the exact appeal-authority confirmation and an external signer file. It initializes the mainnet
appeal policy to `u144`. The command is deliberately excluded from GitHub branch workflows.
After deployment, execute only the two immediate appealed canaries so no escrow is left waiting
for the 144-block deadline. The runner requires four separate persistent principals, three
external mode-0600 signer files, exact source hashes, deny-mode post-conditions and the typed
confirmation `execute-controlled-v5-v4-mainnet`:

```bash
STACKS_NETWORK=mainnet \
AUTONOMOUS_ESCROW_MAINNET_E2E_ASSET=sbtc \
AUTONOMOUS_ESCROW_MAINNET_E2E_SCENARIO=reject-appeal-resolve-approve \
CONFIRM_AUTONOMOUS_ESCROW_MAINNET_E2E=execute-controlled-v5-v4-mainnet \
npm run e2e:autonomous:legacy-v5-v4:mainnet
```

These completed internal canaries prove historical v5/v4 operability but never count as external
adoption, non-team wallets or revenue. Generic mainnet aliases no longer target this generation.

Verified v4/v3 testnet evidence on 2026-08-30:

- `agentic-commerce-v4` deployment: `e487f4f5…dd9b8`, block 209312, `success (ok true)`;
- `sbtc-commerce-v3` deployment: `1ec7fff7…b7a9`, block 209314, `success (ok true)`;
- PoX-5 configuration and both reputation allowlists: blocks 209316–209320, all `success (ok true)`;
- STX complete: PASS 27/27;
- official PoX-5 sBTC complete: PASS 30/30;
- sBTC real-timeout preparation: PASS 20/20, job `u2`, submitted at burn `11091`, deadline `11103`;
- sBTC timeout settlement: PASS 12/12 plus 10/10 public-state checks, tx
  [`0x06537111…15bb9`](https://explorer.hiro.so/txid/0x06537111ef6c75d3c5d750154f97a3b4a0c233a84639583f7af18b2386915bb9?chain=testnet),
  block `214365`, burn `11290`, terminal `u6`, zero escrow and one exact 1,000-atomic-unit payout;
- timeout payout created no completion outcome, reputation success or rating, and no second
  settlement was broadcast.

These controlled testnet identities never count as external M2 adoption.
The complete frozen anchor and digest set is documented in
[`TESTNET_SECURITY_EVIDENCE.md`](TESTNET_SECURITY_EVIDENCE.md). It is reproducible security
evidence, not an independent audit opinion.

Keep the reviewed testnet deployer's signer file outside Git, then run only after the local test and
security gates pass:

```bash
npm test
npm run security:gate

STACKS_NETWORK=testnet \
CONFIRM_VERSIONED_ESCROW_TESTNET_DEPLOY=yes \
VERSIONED_ESCROW_TESTNET_ENV_PATH=/absolute/path/to/testnet.env \
npm run deploy:versioned:testnet
```

The script:

1. derives and verifies the `ST...` deployer before spending testnet STX;
2. requires the existing SIP-010 trait to match the reviewed local source;
3. deploys the local `sip-010-trait` first when absent, then only missing candidate contracts, and
   rejects every same-name source mismatch;
4. configures the official PoX-5 testnet sBTC on `sbtc-commerce-v3`, but only when its current
   owner-controlled default differs;
5. authorizes both candidate escrow contracts on `reputation-registry-v3`;
6. verifies ownership and writes a secret-free receipt to
   `/tmp/nayori-versioned-escrow-testnet.json`.

### Versioned escrow testnet E2E

Run only after the exact candidate deployment receipt is verified. The runner has no mainnet path,
generates isolated provider/evaluator identities only in memory, requires deny-mode exact funding
and settlement post-conditions, and writes a secret-free receipt under `/tmp`.

```bash
STACKS_NETWORK=testnet \
CONFIRM_VERSIONED_ESCROW_TESTNET_E2E=yes \
VERSIONED_ESCROW_TESTNET_ENV_PATH=/absolute/path/to/testnet.env \
VERSIONED_ESCROW_E2E_ASSET=stx \
VERSIONED_ESCROW_E2E_SCENARIO=complete \
npm run e2e:versioned:testnet
```

Supported assets are `stx` and `sbtc`. A complete run verifies exact funding, submitted state,
the too-early timeout guard, evaluator payout, cleared escrow, durable reputation outcome and
rating persistence. The sBTC run also requires the PoX-5 asset balance and verifies the per-job
pinned token. Never substitute an unofficial SIP-010 token.

Timeout evidence is intentionally split rather than waiting in one process for 12 Bitcoin blocks:

```bash
# Prepare a submitted job and record its job ID/review deadline.
VERSIONED_ESCROW_E2E_SCENARIO=prepare-timeout npm run e2e:versioned:testnet

# After the recorded Bitcoin review deadline has passed.
VERSIONED_ESCROW_E2E_SCENARIO=settle-timeout \
VERSIONED_ESCROW_E2E_JOB_ID=<job-id> \
npm run e2e:versioned:testnet
```

Pass the same explicit network, confirmation, env path and asset variables to both commands. A
timeout settlement checks the current Bitcoin height before signing, binds the exact live escrow
outflow, requires terminal state `u6` and verifies that escrow is zero. Never count these internal
testnet actors or jobs toward M2 adoption.

The corresponding testnet preview selects:

```env
NEXT_PUBLIC_STACKS_NETWORK=testnet
NEXT_PUBLIC_STX_COMMERCE_CONTRACT=agentic-commerce-v6
NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT=sbtc-commerce-v5
NEXT_PUBLIC_REPUTATION_CONTRACT=reputation-registry-v3
NEXT_PUBLIC_NAYORI_EVALUATOR_ADDRESS=STBTXHXFXFGMNPXST7A6XQ1WNGC0V6TB6CDDQZB4
NEXT_PUBLIC_NAYORI_MANAGED_EVALUATOR_ENABLED=true
NEXT_PUBLIC_NAYORI_APPEAL_AUTHORITY_ADDRESS=ST256E5DAXM7RDFZ76ECCTPTBYHRXXJQ29H16DN69
```

The separately guarded mainnet promoter defaults to a signer-free preflight and leaves all
Web/SDK/API variables unchanged:

```bash
npm run preflight:versioned:legacy-v4-v3:mainnet
```

After reviewing the preflight receipt, exact source digests, deployer balance, nonce, empty mempool
and maximum fees, the authorized mainnet release uses both typed confirmations and an external
signer file:

```bash
STACKS_NETWORK=mainnet \
VERSIONED_ESCROW_MAINNET_ACTION=deploy \
CONFIRM_VERSIONED_ESCROW_MAINNET_DEPLOY=deploy-v4-v3-mainnet \
CONFIRM_VERSIONED_ESCROW_MAINNET_DEPLOYER=SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH \
VERSIONED_ESCROW_MAINNET_ENV_PATH=/absolute/path/to/.env.mainnet \
npm run deploy:versioned:legacy-v4-v3:mainnet
```

The promoter refuses source drift and pending deployer transactions, submits one deny-mode
transaction at a time, verifies every `(ok ...)` result, configures canonical mainnet sBTC,
authorizes both commerce contracts in `reputation-registry-v3`, and verifies initial zero job
counts. It writes a secret-free receipt outside Git. Deployment alone does not switch consumers;
Web, SDK and API configuration are promoted separately after independent verification and a
minimal-value mainnet smoke test.

### Mainnet sBTC v3 smoke test

Before changing production consumers, run the signer-free smoke preflight from the exact merged
release. Its receipt and actor recovery paths must be absolute and outside Git:

```bash
STACKS_NETWORK=mainnet \
VERSIONED_ESCROW_MAINNET_E2E_ACTION=preflight \
VERSIONED_ESCROW_MAINNET_E2E_RESULT_PATH=/external/evidence/mainnet-smoke.json \
npm run e2e:versioned:legacy-v4-v3:mainnet
```

Execution creates one internal team-operated job for exactly 100 atomic sBTC units. It persists
provider/evaluator recovery keys only in a required external mode-`0600` file and never includes
them in the receipt:

```bash
STACKS_NETWORK=mainnet \
VERSIONED_ESCROW_MAINNET_E2E_ACTION=execute \
CONFIRM_VERSIONED_ESCROW_MAINNET_E2E=execute-100-sats-mainnet \
CONFIRM_VERSIONED_ESCROW_MAINNET_DEPLOYER=SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH \
VERSIONED_ESCROW_MAINNET_ENV_PATH=/external/secrets/.env.mainnet \
VERSIONED_ESCROW_MAINNET_ACTOR_ENV_PATH=/external/secrets/.env.mainnet-smoke-actors \
VERSIONED_ESCROW_MAINNET_E2E_RESULT_PATH=/external/evidence/mainnet-smoke.json \
npm run e2e:versioned:legacy-v4-v3:mainnet
```

The required terminal invariants are status `u3`, escrow zero, an exact 100-unit provider payout,
successful reputation synchronization and one persisted client rating. This workflow passed
26/26 on 2026-08-31 for job `u1`; an independent signer-free read reconfirmed the terminal state.
It is internal operational evidence and is never external M2 adoption or revenue.

## Frontend production variables

### Workflow timing disclosure (live in production and QA)

`NAYORI_WORKFLOW_BURN_BLOCKS` and `NAYORI_SETTLEMENT_BURN_BLOCKS` are server-runtime disclosure
settings, defaulting to 6/6. Both accept integers up to 144; mainnet minimum is 6, testnet minimum
is 0, and settlement cannot be weaker than workflow. Invalid values cause the timing endpoint
to return 503. These settings do not reconfigure any wallet, existing signer permit, facilitator,
x402/MPP path or contract. Match the advertised baseline to newly issued operator permits.

Web/docs QA validation passed 24 public checks on 2026-09-09 UTC. Production Web/docs release
`e4b0e24422631c11c77c1a7945e8b7ece7e1e5af` passed its rollout and public postchecks on
2026-09-13 UTC. Verify `/api/v1/workflow-timing?asset=stx` and `?asset=sbtc` on every target network.
Check contract identity, live windows, unavailable behavior,
terminal decision history and absence of active countdowns on closed jobs. Version-1 SDK permits
remain six-block; new configurable permits require the separate SDK release and new permissions.
No active run is migrated by this configuration or documentation.

Configure these values in the target production build environment:

```env
NEXT_PUBLIC_STACKS_NETWORK=mainnet
NEXT_PUBLIC_CONTRACT_ADDRESS=SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH
NEXT_PUBLIC_CONTRACT_PROFILE=current-v6-v5
NEXT_PUBLIC_STX_COMMERCE_CONTRACT=agentic-commerce-v6
NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT=sbtc-commerce-v5
NEXT_PUBLIC_REPUTATION_CONTRACT=reputation-registry-v3
NEXT_PUBLIC_NAYORI_EVALUATOR_ADDRESS=SP3GRG5CKEFNYM5BV0NPPHCM51FT176JQ02QWQ9T3
NEXT_PUBLIC_NAYORI_MANAGED_EVALUATOR_ENABLED=false
NEXT_PUBLIC_NAYORI_APPEAL_AUTHORITY_ADDRESS=SP2R584GC8W2A921080TY8CQ8P1GZ6JNXYXS65DA6
NEXT_PUBLIC_SITE_URL=https://nayori.ai
```

Rebuild the production deployment after changing environment variables.

The app supports a non-root standalone container through `App/Dockerfile`. Build images only on
the Nayori deployment VPS. A candidate for `preview.nayori.ai` must use its own
`NEXT_PUBLIC_SITE_URL`; validate `/api/health`, wallet connection and all public routes before
production promotion. Retain the previous production image and Compose file as rollback.

### Agent-readiness smoke checks

Before promotion, verify GET and HEAD behavior, media types and CORS for:

- `/.well-known/api-catalog` (`application/linkset+json`);
- `/.well-known/ard.json` and `/.well-known/ai-catalog.json`;
- `/.well-known/agent-skills/index.json` and every indexed `SKILL.md`;
- `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource` and `/auth.md`;
- `/.well-known/mcp/server-card.json` and `/x402.json`;
- `/api/v1`, expecting 402 plus `PAYMENT-REQUIRED` without a payment, and an OPTIONS response that
  permits `PAYMENT-SIGNATURE` and `X-NAYORI-SIGNED-QUOTE`;
- `/api/mpp/v1`, expecting 402 plus `WWW-Authenticate: Payment`, a challenge selecting
  `Payment-Authorization`, and an OPTIONS response that permits the selected credential header and
  `X-NAYORI-SIGNED-QUOTE`;
- `/openapi.json`, expecting a canonical `Link` to `api.nayori.ai/openapi.json` and a direct
  single-offer MPP `x-payment-info` on `GET /mpp/v1` with `method=usdc`, `intent=charge` and
  `amount=10000`;
- `/evidence`, confirming a live or explicitly unavailable mainnet data status, plus
  `/api/evidence.json` and the stable M1 `/api/evidence.csv` export;
- `/robots.txt`, including `Content-Signal` and `Agentmap`; and
- `/` with both HTML and `Accept: text/markdown`, including discovery `Link` headers.

Recompute each skill SHA-256 over the exact response bytes and compare it with the index digest.
Use a browser with WebMCP instrumentation to confirm the three public tools exist at load time and
remain read-only. Finally, rerun [isitagentready.com](https://isitagentready.com/nayori.ai) against
the preview. The OAuth service and Platform must pass their live metadata/JWKS and
token-verification probes before the web points discovery to `oauth.nayori.ai`. Publish DNS-AID
only after those production endpoints are independently testable.

## Developer documentation deployment

`developer-portal/` is an independent Next.js/Fumadocs application for `docs.nayori.ai`. It must
not be served from the transactional Web container after its dedicated rollout.

Build `developer-portal/Dockerfile` only on the Nayori VPS from the exact merged source archive.
Run its validation before building:

```bash
cd developer-portal
npm ci
npm run verify
```

Promote a dedicated preview container and validate:

1. `/api/health`, `/api/search`, `/sitemap.xml`, `/robots.txt`, `/llms.txt` and `/openapi.json`;
2. canonical metadata uses `https://docs.nayori.ai`;
3. SDK, OAuth, escrow, x402, MPP, contracts and generated API pages render;
4. protected and economic API operations have no generic browser proxy;
5. desktop, keyboard and 390-pixel mobile layouts have no horizontal page overflow; and
6. every Mermaid diagram renders with Stacks orange `#FC6432`.

After preview passes, change only the Caddy upstream for `docs.nayori.ai` from the temporary Web
alias to the dedicated docs service. Retain the prior route and image as rollback artifacts. This
deployment does not enable settlement, sponsorship, OAuth registration or any contract change.

## Nayori partner API

The public API edge is available at [api.nayori.ai](https://api.nayori.ai) on Stacks mainnet. Its
production role is intentionally narrow and separated from the economic facilitator:

- the separate `oauth.nayori.ai` service binds invited OAuth clients to Stacks wallets through an
  exact Leather-signed challenge;
- API keys remain backward compatible, while OAuth uses short-lived scoped client-credentials tokens;
- authenticated partners can issue request-bound quotes and use implemented public-resource and
  MCP operations; the API edge's own verify, settle, confirm and delivery-ledger flags remain false;
- `facilitator.nayori.ai` owns mainnet payment verification, settlement confirmation, signed
  receipts and the delivery ledger, with exact capabilities published by its own `/supported`;
- supported network, mechanisms and assets must be read from both live `/supported` responses;
- machine discovery is available through
  [the agent manifest](https://api.nayori.ai/.well-known/agent.json),
  [`/supported`](https://api.nayori.ai/supported),
  [OpenAPI](https://api.nayori.ai/openapi.json) and
  [JWKS](https://api.nayori.ai/.well-known/jwks.json),
  [OAuth metadata](https://oauth.nayori.ai/.well-known/oauth-authorization-server),
  [Auth.md](https://nayori.ai/auth.md) and the
  [MCP Server Card](https://api.nayori.ai/.well-known/mcp/server-card.json); and
- fee sponsorship, partner self-registration and arbitrary resource proxying are disabled.

Do not treat a signed quote, verification, broadcast or pending response as proof of confirmed
settlement. OAuth cannot sign a payment; the payer separately authorizes every transaction. The API is deployed independently
from this public web repository, and no private platform configuration or credentials belong in
this repository.

### Same-origin x402 resource

The web route `nayori.ai/api/v1` is intentionally a narrow GET/OPTIONS proxy to
`api.nayori.ai/v1`. It forwards only `Accept`, `PAYMENT-SIGNATURE`, `X-NAYORI-SIGNED-QUOTE` and a
safe request ID. It never forwards cookies, browser authorization, origin headers or a request
body. It preserves 402, 202 and 200 status codes plus the x402, polling and release headers.

The API runtime holds one merchant key and calls `facilitator.nayori.ai` over HTTPS. The
facilitator runtime owns quote signing, transaction verification, mainnet settlement,
reconciliation, signed receipts and the delivery ledger in its own database. Both runtimes may be
built from `PerkOS-Nayori-Platform`, but must use separate environment files, processes, host
routes and database credentials. Do not expose the merchant key in the web deployment.

Promotion order is facilitator, API resource server, then web. Before rescoring, verify:

1. facilitator health, readiness and discovery on the new DNS host;
2. an unauthenticated apex GET returns a valid x402 v2 402 challenge;
3. a wallet-approved submission returns 202 and a canonical same-origin polling location;
4. no resource body is delivered before canonical confirmation; and
5. the confirmed response contains `PAYMENT-RESPONSE` and remains idempotent on retry.

The current mainnet facilitator advertises payment verification, settlement, confirmation and
delivery-ledger support. Verify both role-specific `/supported` documents immediately before a
rollout: the API edge must remain challenge/resource-only for those economic flags, while the
facilitator must report the matching mainnet network, assets and mechanisms. External contract
review remains a separate grant/release gate; do not misrepresent it as runtime activation state.

### Same-origin MPP PaymentAuth resource

The web route `nayori.ai/api/mpp/v1` is an independent GET/OPTIONS proxy to
`api.nayori.ai/mpp/v1`. It forwards only `Accept`, `Payment-Authorization`,
`X-NAYORI-SIGNED-QUOTE` and a safe request ID. It never forwards cookies, ordinary
`Authorization`, `Origin`, x402's `PAYMENT-SIGNATURE` or a request body. It preserves 402, 202 and
200 status codes plus `WWW-Authenticate`, polling, `Payment-Receipt` and release headers.

Enable `MPP_RESOURCE_ENABLED=true` only on the API resource-server runtime after provisioning the
`MPP_RESOURCE_ROUTE_ID` merchant route as USDCx on the exact selected Stacks network. Keep the
flag false on the facilitator runtime. The resource server fails closed if that route returns any
asset other than USDCx. Both runtime roles must pin the same reviewed SDK release and lockfile as
the promoted Platform release; never reuse an obsolete version from a historical runbook.

Promotion order remains facilitator, API resource server, then web. Validate that:

1. the challenge declares `method=usdc`, `intent=charge`, `type=stacks`, the official same-network
   USDCx identity, exact amount and recipient;
2. OAuth Bearer and `Payment-Authorization` remain independent header domains;
3. a wallet-approved credential returns 202 and a canonical same-origin polling location;
4. malformed or expired credentials receive a fresh 402 Payment challenge;
5. no report or `Payment-Receipt` exists before canonical confirmation; and
6. confirmed retries return the same report without a second charge.

MPP sponsorship remains disabled. Mainnet economic availability is determined by the live
facilitator `/supported` response and an end-to-end receipt, not by the API edge flags or the
external-review schedule.

The credential-free `nayori.ai/openapi.json` route is a narrow read-only view of
`api.nayori.ai/openapi.json`. It forwards no browser headers or credentials and fails closed with
503 when the authoritative schema is unavailable. Because some registries do not yet accept the
draft's preferred `offers[]` form, the apex emits the semantically equivalent single-offer
shorthand for the one public MPP route and links to the canonical API schema. Do not replace it
with a copied static schema; runtime discovery must stay aligned with the Platform flags that
actually expose MPP, and the 402 challenge remains authoritative.

## Testnet

Use `App/testnet.env.example` for a branch-scoped Vercel Preview. Testnet validation
must not replace the Production variables above. The existing testnet STX v2 lifecycle
can be reproduced with:

```bash
npm run e2e:stx-v2:testnet
```
