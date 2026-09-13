import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
      /NEXT_PUBLIC_STX_COMMERCE_CONTRACT\s*\|\|\s*"agentic-commerce-v6"/,
    );
    expect(constants).toMatch(
      /NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT\s*\|\|\s*"sbtc-commerce-v5"/,
    );
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
      "run-service-fee-mainnet-e2e-sequential.sh",
    );
    expect(scripts["preflight:e2e:autonomous:mainnet"]).toContain(
      "run-service-fee-mainnet-e2e-sequential.sh",
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
      "const MAX_TOTAL_TOP_UP = 900_000n",
      "provider top-up stays within the typed total cap",
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

  it("executes STX and sBTC strictly sequentially with distinct receipts", () => {
    const wrapper = read("scripts/run-service-fee-mainnet-e2e-sequential.sh");
    const stx = wrapper.indexOf("SERVICE_FEE_MAINNET_E2E_ASSET=stx");
    const sbtc = wrapper.indexOf("SERVICE_FEE_MAINNET_E2E_ASSET=sbtc", stx + 1);
    expect(stx).toBeGreaterThan(0);
    expect(sbtc).toBeGreaterThan(stx);
    expect(wrapper).toContain("SERVICE_FEE_MAINNET_E2E_STX_RESULT_PATH");
    expect(wrapper).toContain("SERVICE_FEE_MAINNET_E2E_SBTC_RESULT_PATH");
    expect(wrapper).toContain('if [ -z "$stx_receipt" ] || [ -z "$sbtc_receipt" ]');
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
});
