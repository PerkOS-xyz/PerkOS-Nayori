import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const json = (path: string) => JSON.parse(read(path));
const sha256 = (path: string) =>
  createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");

describe("active v6/v5 consumer release", () => {
  it("promotes Web defaults while retaining explicit historical reads", () => {
    const constants = read("App/src/constants/contract.ts");
    expect(constants).toMatch(
      /"current-v6-v5":\s*\{[\s\S]*?stx:\s*"agentic-commerce-v6"[\s\S]*?sbtc:\s*"sbtc-commerce-v5"[\s\S]*?readOnly:\s*false/,
    );
    expect(constants).toContain('value || "current-v6-v5"');
    for (const historical of ["agentic-commerce-v5", "sbtc-commerce-v4"])
      expect(constants).toContain(historical);
    for (const path of ["App/.env.example", "App/Dockerfile", "App/README.md"]) {
      expect(read(path)).toContain("agentic-commerce-v6");
      expect(read(path)).toContain("sbtc-commerce-v5");
    }
  });

  it("keeps QA controller, release schema and suite on one exact generation", () => {
    const controller = read("ops/vps/nayori-qa-release");
    expect(controller).toContain(
      "NEXT_PUBLIC_STX_COMMERCE_CONTRACT=agentic-commerce-v6",
    );
    expect(controller).toContain(
      "NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT=sbtc-commerce-v5",
    );
    const schema = json("deployments/qa-release.schema.json");
    expect(schema.properties.contracts.properties.stx.pattern).toContain(
      "agentic-commerce-v6",
    );
    expect(schema.properties.contracts.properties.sbtc.pattern).toContain(
      "sbtc-commerce-v5",
    );
    const suite = json("tests/e2e/qa-suite.json");
    expect(suite.contracts.stx).toBe(
      "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.agentic-commerce-v6",
    );
    expect(suite.contracts.sbtc).toBe(
      "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.sbtc-commerce-v5",
    );
  });

  it("builds each Web channel with its exact isolated service origins", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow.match(/apiOrigin: https:\/\/api\.qa\.nayori\.ai/g)).toHaveLength(2);
    expect(workflow.match(/facilitatorOrigin: https:\/\/facilitator\.qa\.nayori\.ai/g))
      .toHaveLength(2);
    expect(workflow.match(/oauthOrigin: https:\/\/oauth\.qa\.nayori\.ai/g)).toHaveLength(2);
    expect(workflow.match(/apiOrigin: https:\/\/api\.nayori\.ai/g)).toHaveLength(1);
    expect(workflow.match(/facilitatorOrigin: https:\/\/facilitator\.nayori\.ai/g))
      .toHaveLength(1);
    expect(workflow.match(/oauthOrigin: https:\/\/oauth\.nayori\.ai/g)).toHaveLength(1);
    expect(workflow).toContain(
      "NEXT_PUBLIC_NAYORI_FACILITATOR_ORIGIN: ${{ matrix.facilitatorOrigin }}",
    );
    expect(workflow).toMatch(
      /- run: npm test[\s\S]*?NEXT_PUBLIC_CONTRACT_PROFILE: current-v6-v5[\s\S]*?NEXT_PUBLIC_STX_COMMERCE_CONTRACT: agentic-commerce-v6[\s\S]*?NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT: sbtc-commerce-v5[\s\S]*?- run: npm run lint/,
    );
  });

  it("pins the signer-free mainnet verifier to exact sources and policy", () => {
    const verifier = read("scripts/verify-current-mainnet.mjs");
    for (const expected of [
      "agentic-commerce-v6",
      "sbtc-commerce-v5",
      "8eb55eccf0421b35ec6ff87be3bc8e99a356be5a4b882d8a3e9585019f40a7b2",
      "132567979dc49ba5726465ee12e5590cf26329acb9a31f0596f92008d0052f53",
      "SP28DBK3Q89F4KRYGPF51QT0RYEZBPXS4BAQ0ETBH",
      "SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8",
      "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
      "const REVIEW_WINDOW = 12n",
      "const APPEAL_WINDOW = 144n",
      "const SERVICE_FEE_BPS = 200n",
      "get-pending-owner",
      "TWO_STEP_OWNER_CONTROLLED",
      "get-pending-appeal-authority",
    ])
      expect(verifier).toContain(expected);
    expect(verifier).not.toMatch(
      /PRIVATE_KEY|broadcastTransaction|makeContractCall|makeContractDeploy/,
    );
  });

  it("keeps the immutable pre-fee contract sources byte-identical", () => {
    expect(sha256("contracts/agentic-commerce-v5.clar")).toBe(
      "e5bf374aaf514903205a9f069a794a4c34eb0f1100fb144c13ccd397e80664e7",
    );
    expect(sha256("contracts/sbtc-commerce-v4.clar")).toBe(
      "4ab54889b8f08835f2942bd8f0b9add4d6950b0307bcbf6f8691c0a0b4d8debc",
    );
  });
});

describe("controlled v6/v5 mainnet E2E runner", () => {
  it("moves the generic alias to v6/v5 and qualifies every old alias", () => {
    const scripts = json("package.json").scripts;
    expect(scripts["e2e:autonomous:mainnet"]).toContain(
      "run-service-fee-mainnet-e2e-hardened.sh",
    );
    expect(scripts["preflight:e2e:autonomous:mainnet"]).toContain(
      "run-service-fee-mainnet-e2e-campaign.mjs",
    );
    expect(scripts["e2e:autonomous:mainnet:asset"]).toContain(
      "e2e-service-fee-mainnet.mjs",
    );
    expect(scripts["deploy:autonomous:legacy-v5-v4:mainnet"]).toContain(
      "deploy-autonomous-escrow-mainnet.mjs",
    );
    expect(scripts["e2e:autonomous:legacy-v5-v4:mainnet"]).toContain(
      "e2e-autonomous-escrow-mainnet.mjs",
    );
    expect(scripts["deploy:autonomous:mainnet"]).toBeUndefined();
    for (const staleAlias of [
      "deploy:mainnet",
      "preflight:versioned:mainnet",
      "deploy:versioned:mainnet",
      "preflight:e2e:versioned:mainnet",
      "e2e:versioned:mainnet",
    ]) expect(scripts[staleAlias]).toBeUndefined();
    expect(scripts["deploy:bootstrap:legacy-v2:mainnet"]).toContain(
      "deploy-current-mainnet.mjs",
    );
    expect(scripts["deploy:versioned:legacy-v4-v3:mainnet"]).toContain(
      "deploy-versioned-escrow-mainnet.mjs",
    );
    for (const path of [
      "docs/DEPLOYMENT.md",
      "scripts/deploy-mainnet.mjs",
      "scripts/deploy-sbtc-mainnet.mjs",
    ]) expect(read(path)).not.toContain("npm run deploy:mainnet");
  });

  it("requires exact release, custody, economics and external evidence", () => {
    const runner = read("scripts/e2e-service-fee-mainnet.mjs");
    for (const expected of [
      "execute-controlled-v6-v5-mainnet",
      "merge-base",
      "origin/main",
      "exact mode 0600",
      "PostConditionMode.Deny",
      "const FEE = BUDGET / 50n",
      "const NET = BUDGET - FEE",
      "provider receives exact 98% net",
      "treasury receives exact 2% fee",
      "settlement has one net payout and one fee transfer only",
      "terminal job is completed with zero escrow",
      "reputation synchronization completed once",
      "internal-team-operated-not-m2-adoption",
      "SERVICE_FEE_MAINNET_E2E_RESULT_PATH",
      "CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_TOP_UP_MICRO_STX",
      "const MAX_CAMPAIGN_TOP_UP = 900_000n",
      "CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_NETWORK_FEES_MICRO_STX",
      "const MAX_CAMPAIGN_NETWORK_FEES = 3_500_000n",
      "provider top-up stays within the remaining aggregate campaign cap",
      "SP2ENKFX2BGX94HC4KYZCCV7KEN7JXJXZDKC3GPGC",
      "reconcile-existing-receipt",
      "no automatic retransmission is allowed",
      "executionLock()",
      "CLIENT_PRIVATE_KEY",
      "Armed E2E requires the exact ephemeral npm-ci runtime attestation",
      "preSettlementBalances",
      "getAddressFromPrivateKey(key, \"mainnet\")",
      "Receipt SHA-256",
    ])
      expect(runner).toContain(expected);
    expect(runner).not.toMatch(/STACKS_TESTNET|PostConditionMode\.Allow|randomPrivateKey/);
  });

  it("returns from preflight before opening signer files", () => {
    const runner = read("scripts/e2e-service-fee-mainnet.mjs");
    const publicVerification = runner.lastIndexOf(
      "const publicState = await verifyPublicRelease()",
    );
    const preflightReturn = runner.lastIndexOf(
      'if (ACTION === "preflight") return preflight',
    );
    const executeCall = runner.lastIndexOf("await execute(publicState)");
    const firstSignerRead = runner.indexOf("const clientEnv = parseEnv(secretFile(");
    const localGate = runner.indexOf('["run", "security:gate"]');
    expect(publicVerification).toBeGreaterThan(0);
    expect(preflightReturn).toBeGreaterThan(publicVerification);
    expect(executeCall).toBeGreaterThan(preflightReturn);
    expect(firstSignerRead).toBeGreaterThan(localGate);
  });

  it("checks exact escrow and journals any bounded actor top-up", () => {
    const runner = read("scripts/e2e-service-fee-mainnet.mjs");
    expect(runner).toMatch(
      /fundedEscrow\s*===\s*BUDGET[\s\S]*?atomic units/,
    );
    expect(runner).toMatch(
      /makeSTXTokenTransfer[\s\S]*?PostConditionMode\.Deny[\s\S]*?canonical-success/,
    );
    expect(runner).toContain("provider reaches the bounded gas reserve after one exact top-up");
    expect(runner).not.toContain("serializedTransaction");
  });

  it("coordinates STX and sBTC under one lock, manifest and aggregate cap", () => {
    const wrapper = read("scripts/run-service-fee-mainnet-e2e-campaign.mjs");
    const stx = wrapper.indexOf('["stx", "stx-first", stxReceipt]');
    const sbtc = wrapper.indexOf('["sbtc", "sbtc-second", sbtcReceipt]', stx + 1);
    expect(stx).toBeGreaterThan(0);
    expect(sbtc).toBeGreaterThan(stx);
    expect(wrapper).toContain("SERVICE_FEE_MAINNET_E2E_STX_RESULT_PATH");
    expect(wrapper).toContain("SERVICE_FEE_MAINNET_E2E_SBTC_RESULT_PATH");
    expect(wrapper).toContain("SERVICE_FEE_MAINNET_E2E_CAMPAIGN_PATH");
    expect(wrapper).toContain("acquireCampaignLock(GLOBAL_LOCK_PATH");
    expect(wrapper).toContain("aggregateTopUpUsed");
    expect(wrapper).toContain("aggregateNetworkFeesUsed");
    expect(wrapper).toContain("reconcile-existing-campaign");
    expect(wrapper).toContain("validateRecordedAssets(manifest, stages, campaignId)");
    expect(wrapper).toContain("immutable receipt is missing");
    expect(wrapper).toContain('state: "started"');
    const startedMarker = wrapper.indexOf('state: "started"');
    const markerSave = wrapper.indexOf("atomicSave(manifestPath, manifest)", startedMarker);
    const childRun = wrapper.indexOf("const result = runAsset(", markerSave);
    expect(markerSave).toBeGreaterThan(startedMarker);
    expect(childRun).toBeGreaterThan(markerSave);
    expect(wrapper).toContain("CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_PATH");
    expect(wrapper).toContain("receiptChecksPassed");
    const lock = read("scripts/mainnet-e2e-campaign-lock.mjs");
    expect(lock).toContain("acquireExecutorLease");
    expect(lock).toContain("executorLeasePath");
    expect(lock).toContain("Preserved executor lease is still owned by a live child process");
    expect(lock.match(/acquireRecoveryGuard\(/g)?.length).toBeGreaterThanOrEqual(3);
    const runner = read("scripts/e2e-service-fee-mainnet.mjs");
    expect(runner.match(/accountLock\.assertOwned\(\);/g)?.length).toBe(2);
    expect(runner.match(/GLOBAL_LOCK_PATH}\.recover/g)?.length).toBe(2);
    expect(runner).toContain("can never be promoted to passed");
    const transactionsComplete = wrapper.indexOf('manifest.result = "transactions-complete"');
    const release = wrapper.indexOf("lock.releaseSuccess()", transactionsComplete);
    const passed = wrapper.indexOf('manifest.result = "passed"', release);
    expect(transactionsComplete).toBeGreaterThan(0);
    expect(release).toBeGreaterThan(transactionsComplete);
    expect(passed).toBeGreaterThan(release);
  });

  it("opens signers only through an exact ephemeral dependency runtime", () => {
    const launcher = read("scripts/run-service-fee-mainnet-e2e-hardened.sh");
    expect(launcher).toContain("/private/tmp/nayori-mainnet-e2e-release-");
    expect(launcher).toContain("npm ci --ignore-scripts --no-audit --no-fund");
    expect(launcher).toContain("exec /usr/bin/env -i");
    expect(launcher).toContain("SERVICE_FEE_MAINNET_E2E_RUNTIME_ATTESTATION");
    expect(launcher).toContain("CONFIRM_SERVICE_FEE_MAINNET_E2E_CLIENT");
    expect(launcher).toContain(
      "CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_NETWORK_FEES_MICRO_STX",
    );
    expect(launcher).toContain(
      "CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_SHA256",
    );
  });

  it("uses high-water-mark resume checks and never retransmits uncertainty", () => {
    const runner = read("scripts/e2e-service-fee-mainnet.mjs");
    expect(runner).toContain('if (!hasTransaction("assign-provider"))');
    expect(runner).toContain('if (!hasTransaction("record-decision"))');
    expect(runner).toContain('if (!hasTransaction("appeal-decision"))');
    expect(runner).toContain('if (!hasTransaction("resolve-appeal"))');
    expect(runner).toContain("receipt intent differs from the deterministically reconstructed transaction");
    expect(runner).toContain("no automatic retransmission is allowed");
    for (const label of [
      "Persisted job expiration reached before create-job",
      "Budget stage",
      "Funding stage",
      "Assignment stage",
      "Submission stage",
      "Review deadline",
      "Appeal deadline",
      "Resolution deadline",
    ]) expect(runner).toContain(label);
    expect(runner).toMatch(
      /if \(!hasTransaction\("resolve-appeal"\)\)[\s\S]*?STATUS_DISPUTED[\s\S]*?BUDGET[\s\S]*?requireBurnDeadlineOpen[\s\S]*?"resolve-appeal"/,
    );
  });

  it("makes intent journals, campaign manifests and global locks durable", () => {
    const runner = read("scripts/e2e-service-fee-mainnet.mjs");
    const campaign = read("scripts/run-service-fee-mainnet-e2e-campaign.mjs");
    const lock = read("scripts/mainnet-e2e-campaign-lock.mjs");
    for (const content of [runner, campaign, lock]) {
      expect(content).toContain("constants.O_EXCL");
      expect(content).toContain("fsyncSync");
    }
    expect(runner).toMatch(/fsyncSync\(fd\)[\s\S]*?renameSync\(temporary, path\)[\s\S]*?fsyncSync\(parentFd\)/);
    expect(campaign).toMatch(/fsyncSync\(fd\)[\s\S]*?renameSync\(temporary, path\)[\s\S]*?fsyncSync\(parentFd\)/);
    expect(lock).toContain("fsyncParent(path)");
  });
});

describe("public production language", () => {
  const activeDocs = [
    "README.md",
    "contracts/README.md",
    "contracts/agentic-commerce-README.md",
    "contracts/service-fees-README.md",
    "docs/DEPLOYMENT.md",
    "developer-portal/content/docs/index.mdx",
    "developer-portal/content/docs/reference/contracts.mdx",
    "developer-portal/content/docs/reference/sdk.mdx",
    "developer-portal/content/docs/commerce/autonomous-evaluation.mdx",
    "developer-portal/content/docs/commerce/escrow.mdx",
    "developer-portal/content/docs/commerce/service-fees.mdx",
    "developer-portal/content/docs/resources/evidence.mdx",
    "developer-portal/content/docs/resources/limitations.mdx",
  ];

  it.each(activeDocs)("does not retain stale active-generation claims in %s", (path) => {
    const content = read(path);
    for (const stale of [
      "active production contracts are `agentic-commerce-v5`",
      "Production remains v5/v4",
      "Production continues to use STX v5",
      "not current production contracts or application defaults",
      "Active contracts v5/v4",
      "The production generation has no earned service fee",
      "current v5/v4 default generation",
    ])
      expect(content).not.toContain(stale);
  });

  it("labels frozen v5/v4 operational records as historical", () => {
    expect(read("docs/MAINNET_AUTONOMOUS_SECURITY_EVIDENCE.md")).toContain(
      "historical generation",
    );
    expect(read("docs/AUTONOMOUS_QA_RUNBOOK.md")).toContain(
      "Historical v5/v4 procedure",
    );
    expect(read("docs/QA_FEE_CONSUMERS.md")).toContain("Superseded on 2026-09-13");
    expect(read("docs/TESTNET_SERVICE_FEE_RUNBOOK.md")).toContain(
      "Historical activation record",
    );
  });

  it("does not send new SDK users to historical commerce defaults", () => {
    const quickstart = read("developer-portal/content/docs/getting-started/sdk.mdx");
    const rootQuickstart = read("README.md");
    expect(quickstart).toContain("@perkos/agent-sdk@0.8.0");
    expect(quickstart).toContain("agentic-commerce-v6");
    expect(quickstart).toContain("sbtc-commerce-v5");
    expect(quickstart).toContain("serviceFeeAcceptance");
    expect(quickstart).toContain("implicit mainnet defaults");
    expect(rootQuickstart).toContain("agentic-commerce-v6");
    expect(rootQuickstart).toContain("sbtc-commerce-v5");
    expect(rootQuickstart).toContain("serviceFeeAcceptance");
    expect(rootQuickstart).toContain("unpublished `0.9.0` candidate");
    for (const content of [
      quickstart,
      read("developer-portal/content/docs/reference/sdk.mdx"),
      read("developer-portal/content/docs/commerce/autonomous-evaluation.mdx"),
    ]) {
      expect(content).not.toContain("must remain read-only/inert for v6/v5");
      expect(content).not.toContain("must remain disabled with npm `0.8.0`");
      expect(content).not.toContain("fee-term acceptance arrives in `0.9.0`");
    }
    expect(read("docs/DEPLOYMENT.md")).toContain(
      "NEXT_PUBLIC_CONTRACT_PROFILE=current-v6-v5",
    );
  });

  it("keeps documented local npm commands resolvable in a repository package", () => {
    const knownScripts = new Set([
      ...Object.keys(json("package.json").scripts),
      ...Object.keys(json("App/package.json").scripts),
      ...Object.keys(json("developer-portal/package.json").scripts),
    ]);
    const localDocs = [
      "README.md",
      "App/README.md",
      ...readdirSync(resolve(root, "docs"))
        .filter((entry) => entry.endsWith(".md"))
        .map((entry) => `docs/${entry}`),
    ];
    for (const path of localDocs) {
      for (const match of read(path).matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
        expect(knownScripts.has(match[1]), `${path}: npm run ${match[1]}`).toBe(true);
      }
    }
  });

  it("does not overstate the separately gated mainnet Platform rollout", () => {
    const discovery = read("App/src/constants/discovery.ts");
    expect(discovery).toContain(
      "NAYORI_QUOTE_API_SETTLEMENT_ACTIVE = false",
    );
    expect(discovery).toContain('`${NETWORK_NAME}-challenge-issuance-only`');
    expect(discovery).toContain(
      "own payment verification, settlement, confirmation, delivery-ledger and partner-registration flags are disabled",
    );
    expect(discovery).toContain("settlementProvider: NAYORI_FACILITATOR_ORIGIN");
    expect(discovery).toContain("settlementProvider: NAYORI_FACILITATOR_ORIGIN");
    const deployments = read(
      "developer-portal/content/docs/reference/deployments.mdx",
    );
    expect(deployments).toContain(
      "economic and partner-registration flags are disabled by service role",
    );
    expect(deployments).not.toContain("Testnet pilot");
    expect(deployments).not.toContain("Testnet settlement");
    expect(read("App/README.md")).not.toContain("API runs an invite-only testnet pilot");
    expect(read("docs/DEPLOYMENT.md")).not.toContain("as a separate, testnet-only");
    expect(read("docs/DEPLOYMENT.md")).not.toContain("Mainnet settlement stays disabled");
    expect(read("docs/DEPLOYMENT.md")).not.toContain("@perkos/agent-sdk@0.5.1");
    expect(deployments).not.toContain("pending coordinated Platform release");
    const skill = read("App/src/constants/agent-readiness.ts");
    expect(skill).toContain("API edge");
    expect(skill).toContain("facilitator");
    expect(skill).toContain("fail closed on missing or conflicting flags");
    const httpQuickstart = read(
      "developer-portal/content/docs/getting-started/http-api.mdx",
    );
    expect(httpQuickstart).toContain("https://api.nayori.ai/supported");
    expect(httpQuickstart).toContain("https://facilitator.nayori.ai/supported");
    const status = read("STATUS.md");
    expect(status).toContain("disabled by role");
    expect(status).toContain("facilitator.nayori.ai");
    const autonomous = read(
      "developer-portal/content/docs/commerce/autonomous-evaluation.mdx",
    );
    expect(autonomous).toContain("SDK contract-selection boundary");
    expect(autonomous).toContain("implicit defaults remain historical v5/v4");
  });
});
