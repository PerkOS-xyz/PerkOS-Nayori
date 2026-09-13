import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  Cl,
  PostConditionMode,
  getAddressFromPrivateKey,
  makeContractCall,
  makeContractDeploy,
  privateKeyToPublic,
  randomPrivateKey,
  serializeCV,
  signStructuredData,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";
import {
  APPEAL_WINDOW,
  API,
  AUTHORITY,
  CAMPAIGN_STATE_FILENAME,
  CONTRACTS,
  DEPLOYER,
  Journal,
  MAXIMUM_TOTAL_FEES,
  NETWORK_ID,
  RUNTIME_ATTESTATION_VERSION,
  SERVICE_FEE_BPS,
  SOURCE_HASHES,
  TREASURY,
  createReadTransport,
  campaignFeeTotal,
  guard,
  intentHash,
  intentForOperation,
  operationCatalog,
  principal,
  roles,
  send,
  sha256,
  source,
  treasuryCustodyClarity,
  validateBuiltTransaction,
  validateTransaction,
  verifyTreasuryAttestation,
  verifyRuntimeAttestation,
  verifyNodeInfo,
  verifyConfig,
} from "../scripts/service-fee-mainnet-core.mjs";
import { main as deployMain } from "../scripts/deploy-service-fee-mainnet.mjs";

const isolation = realpathSync(
  mkdtempSync(join(tmpdir(), "nayori-mainnet-fee-suite-")),
);
beforeAll(() => {
  vi.stubEnv("TMPDIR", isolation);
  vi.stubEnv("TMP", isolation);
  vi.stubEnv("TEMP", isolation);
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(isolation, { recursive: true, force: true });
});

const treasury = TREASURY;
const otherTreasury = "SP1VSKCGJCBV3EBS8GWPJ9FD1QARHQ9EN8S49PG8T";
const journalOptions = {
  accountLockPath: join(isolation, "mainnet-account.lock"),
};
const directories: string[] = [];
function temporaryDirectory() {
  const path = realpathSync(
    mkdtempSync(join(tmpdir(), "nayori-mainnet-fee-test-")),
  );
  directories.push(path);
  return path;
}
afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("mainnet promotion policy", () => {
  it("pins the new immutable names, sources and economic policy", () => {
    expect(CONTRACTS).toEqual({
      stx: "agentic-commerce-v6",
      sbtc: "sbtc-commerce-v5",
    });
    expect(NETWORK_ID).toBe(1);
    expect(API).toBe("https://api.hiro.so");
    expect(TREASURY).toBe("SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8");
    expect(APPEAL_WINDOW).toBe(144n);
    expect(SERVICE_FEE_BPS).toBe(200n);
    expect(MAXIMUM_TOTAL_FEES).toBe(3_000_000n);
    for (const name of Object.keys(SOURCE_HASHES))
      expect(sha256(source(name))).toBe(SOURCE_HASHES[name]);
    expect(operationCatalog(treasury).map(({ label }) => label)).toEqual([
      "deploy-agentic-commerce-v6",
      "authorize-agentic-commerce-v6",
      "initialize-agentic-commerce-v6",
      "deploy-sbtc-commerce-v5",
      "set-canonical-sbtc",
      "authorize-sbtc-commerce-v5",
      "initialize-sbtc-commerce-v5",
    ]);
  });

  it.each([undefined, "", "testnet"])(
    "rejects network %s before signer or network access",
    async (network) => {
      await expect(
        deployMain({
          STACKS_NETWORK: network,
          SERVICE_FEE_MAINNET_DEPLOYER_ENV_PATH: "/must-not-read",
        }),
      ).rejects.toThrow(/mainnet/);
    },
  );

  it("defaults to preflight and requires every exact deploy acknowledgement", () => {
    expect(
      guard({
        STACKS_NETWORK: "mainnet",
        SERVICE_FEE_MAINNET_TREASURY_ADDRESS: treasury,
      }),
    ).toBe("preflight");
    const base = {
      STACKS_NETWORK: "mainnet",
      SERVICE_FEE_MAINNET_ACTION: "deploy",
      SERVICE_FEE_MAINNET_TREASURY_ADDRESS: treasury,
      CONFIRM_SERVICE_FEE_MAINNET: "deploy-v6-v5-mainnet",
      CONFIRM_SERVICE_FEE_MAINNET_DEPLOYER: DEPLOYER,
      CONFIRM_SERVICE_FEE_MAINNET_AUTHORITY: AUTHORITY,
      CONFIRM_SERVICE_FEE_MAINNET_TREASURY: treasury,
      SERVICE_FEE_MAINNET_DEPLOYER_ENV_PATH: "/external/deployer.env",
      SERVICE_FEE_MAINNET_TREASURY_ATTESTATION_PATH: "/external/treasury-attestation.json",
      CONFIRM_SERVICE_FEE_MAINNET_TREASURY_ATTESTATION_PATH:
        "/external/treasury-attestation.json",
      SERVICE_FEE_MAINNET_RECEIPT_PATH: "/external/deployment-receipt.json",
      CONFIRM_SERVICE_FEE_MAINNET_RECEIPT_PATH: "/external/deployment-receipt.json",
      SERVICE_FEE_MAINNET_STATE_DIR: "/external/campaign-state",
      CONFIRM_SERVICE_FEE_MAINNET_STATE_DIR: "/external/campaign-state",
      CONFIRM_SERVICE_FEE_MAINNET_MAX_FEES_MICRO_STX: "3000000",
      SERVICE_FEE_MAINNET_REVIEWED_SHA: "a".repeat(40),
    };
    expect(() => guard(base)).not.toThrow();
    expect(() =>
      guard({
        ...base,
        SERVICE_FEE_MAINNET_TREASURY_ADDRESS: otherTreasury,
        CONFIRM_SERVICE_FEE_MAINNET_TREASURY: otherTreasury,
      }),
    ).toThrow(/immutable production treasury/);
    for (const field of [
      "CONFIRM_SERVICE_FEE_MAINNET",
      "CONFIRM_SERVICE_FEE_MAINNET_DEPLOYER",
      "CONFIRM_SERVICE_FEE_MAINNET_AUTHORITY",
      "CONFIRM_SERVICE_FEE_MAINNET_TREASURY",
      "CONFIRM_SERVICE_FEE_MAINNET_TREASURY_ATTESTATION_PATH",
      "CONFIRM_SERVICE_FEE_MAINNET_RECEIPT_PATH",
      "CONFIRM_SERVICE_FEE_MAINNET_STATE_DIR",
      "CONFIRM_SERVICE_FEE_MAINNET_MAX_FEES_MICRO_STX",
      "SERVICE_FEE_MAINNET_REVIEWED_SHA",
    ])
      expect(() => guard({ ...base, [field]: "wrong" })).toThrow();
  });

  it("requires a rebuilt ephemeral runtime attestation and rejects preload injection", () => {
    const sha = "a".repeat(40);
    const lock = "b".repeat(64);
    const root = "/private/tmp/nayori-mainnet-release-reviewed";
    const env = {
      CONFIRM_SERVICE_FEE_MAINNET_EPHEMERAL_ROOT: root,
      SERVICE_FEE_MAINNET_RUNTIME_ATTESTATION:
        `${RUNTIME_ATTESTATION_VERSION}:${sha}:${lock}:${root}`,
    };
    expect(() => verifyRuntimeAttestation(env, sha, lock, root, {}, root)).not.toThrow();
    expect(() =>
      verifyRuntimeAttestation(env, sha, lock, "/workspace/nayori", {}, "/workspace/nayori"),
    ).toThrow(/ephemeral/);
    expect(() =>
      verifyRuntimeAttestation(env, sha, lock, root, { NODE_OPTIONS: "--require=/tmp/x.js" }, root),
    ).toThrow(/preload/);
    expect(() =>
      verifyRuntimeAttestation(
        { ...env, SERVICE_FEE_MAINNET_RUNTIME_ATTESTATION: "wrong" },
        sha,
        lock,
        root,
        {},
        root,
      ),
    ).toThrow(/attestation/);
  });

  it("requires distinct standard mainnet roles", () => {
    expect(roles(treasury)).toEqual({
      owner: DEPLOYER,
      authority: AUTHORITY,
      treasury,
    });
    expect(() => roles(DEPLOYER)).toThrow(/distinct/);
    expect(() => roles(AUTHORITY)).toThrow(/distinct/);
    expect(() => principal("ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5")).toThrow(
      /mainnet principal/,
    );
  });

  it.each([
    "treasury",
    "appeal-authority",
    "appeal-window",
    "review-window",
    "service-fee-bps",
    "configured",
  ])("rejects immutable mainnet policy drift in %s", (field) => {
    const config = {
      configured: true,
      treasury,
      "appeal-authority": AUTHORITY,
      "appeal-window": "144",
      "review-window": "12",
      "service-fee-bps": "200",
    };
    expect(() => verifyConfig(config, treasury)).not.toThrow();
    expect(() => verifyConfig({ ...config, [field]: "wrong" }, treasury)).toThrow(
      /configuration/,
    );
  });
});

describe("Leather SIP-018 treasury custody", () => {
  const reviewedSha = "a".repeat(40);
  const now = Date.parse("2026-09-13T12:00:00.000Z");
  const testPrivateKey = `${randomPrivateKey().slice(0, 64)}01`;
  const testPublicKey = privateKeyToPublic(testPrivateKey);
  const testTreasury = getAddressFromPrivateKey(testPrivateKey, "mainnet");

  function signedAttestation(overrides: Record<string, unknown> = {}) {
    const attestation = {
      schemaVersion: 1,
      scheme: "SIP-018-RSV",
      domain: {
        name: "Nayori Mainnet Treasury Custody",
        version: "1",
        chainId: 1,
      },
      message: {
        action: "prove-control-of-nayori-mainnet-treasury",
        treasury: testTreasury,
        deployer: DEPLOYER,
        appealAuthority: AUTHORITY,
        stxContract: CONTRACTS.stx,
        sbtcContract: CONTRACTS.sbtc,
        stxSourceHash: SOURCE_HASHES[CONTRACTS.stx],
        sbtcSourceHash: SOURCE_HASHES[CONTRACTS.sbtc],
        reviewedSha,
        challenge: "c".repeat(64),
        issuedAt: new Date(now - 60_000).toISOString(),
        expiresAt: new Date(now + 3_600_000).toISOString(),
      },
      publicKey: testPublicKey,
      signature: "0".repeat(130),
      ...overrides,
    };
    const clarity = treasuryCustodyClarity(attestation);
    attestation.signature = signStructuredData({
      ...clarity,
      privateKey: testPrivateKey,
    });
    return attestation;
  }

  function writeAttestation(attestation = signedAttestation()) {
    const path = join(temporaryDirectory(), "treasury-attestation.json");
    writeFileSync(path, `${JSON.stringify(attestation, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    return path;
  }

  const verify = (path: string, expectedReviewedSha = reviewedSha) =>
    verifyTreasuryAttestation(path, {
      expectedTreasury: testTreasury,
      expectedReviewedSha,
      now: () => now,
    });

  it("accepts a current signed attestation bound to its mainnet address and release", () => {
    const path = writeAttestation();
    const result = verify(path);
    expect(result.treasury).toBe(testTreasury);
    expect(result.reviewedSha).toBe(reviewedSha);
    expect(result.publicKey).toBe(testPublicKey);
    expect(result.signatureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("rejects a wrong treasury address or public key", () => {
    const wrongAddress = signedAttestation({
      message: { ...signedAttestation().message, treasury: otherTreasury },
    });
    expect(() => verify(writeAttestation(wrongAddress))).toThrow(/treasury|address/i);

    const wrongKey = signedAttestation();
    wrongKey.publicKey = privateKeyToPublic(`${"12".repeat(32)}01`);
    expect(() => verify(writeAttestation(wrongKey))).toThrow(/public key|signature/i);
  });

  it("rejects a message changed after signing and a different reviewed release", () => {
    const tampered = signedAttestation();
    tampered.message.challenge = "d".repeat(64);
    expect(() => verify(writeAttestation(tampered))).toThrow(/signature/i);
    expect(() => verify(writeAttestation(), "b".repeat(40))).toThrow(/reviewed/i);
  });

  it.each([
    [
      "expired",
      new Date(now - 7_200_000).toISOString(),
      new Date(now - 3_600_000).toISOString(),
    ],
    [
      "not yet valid",
      new Date(now + 300_001).toISOString(),
      new Date(now + 600_000).toISOString(),
    ],
    [
      "excess lifetime",
      new Date(now - 60_000).toISOString(),
      new Date(now + 86_400_001).toISOString(),
    ],
  ])("rejects an %s attestation", (_case, issuedAt, expiresAt) => {
    const base = signedAttestation();
    const attestation = signedAttestation({
      message: { ...base.message, issuedAt, expiresAt },
    });
    expect(() => verify(writeAttestation(attestation))).toThrow(/issued|expires|lifetime/i);
  });

  it("rejects an invalid recovery id or an invalid signature", () => {
    const recovery = signedAttestation();
    recovery.signature = `${recovery.signature.slice(0, -2)}04`;
    expect(() => verify(writeAttestation(recovery))).toThrow(/signature|recovery/i);

    const signature = signedAttestation();
    signature.signature = `${signature.signature[0] === "0" ? "1" : "0"}${signature.signature.slice(1)}`;
    expect(() => verify(writeAttestation(signature))).toThrow(/signature|public key/i);
  });

  it("rejects a symlink or a file not owned with exact mode 0600", () => {
    const path = writeAttestation();
    const link = join(temporaryDirectory(), "treasury-attestation-link.json");
    symlinkSync(path, link);
    expect(() => verify(link)).toThrow(/symlink|absolute/i);

    chmodSync(path, 0o644);
    expect(() => verify(path)).toThrow(/0600|mode/i);
  });

  it.each([
    ["extra top-level field", (value: any) => ({ ...value, extra: true })],
    [
      "missing top-level field",
      (value: any) => {
        const { scheme: _scheme, ...rest } = value;
        return rest;
      },
    ],
    [
      "extra domain field",
      (value: any) => ({ ...value, domain: { ...value.domain, extra: true } }),
    ],
    [
      "missing message field",
      (value: any) => {
        const { challenge: _challenge, ...message } = value.message;
        return { ...value, message };
      },
    ],
  ])("rejects JSON with an %s", (_case, mutate) => {
    expect(() => verify(writeAttestation(mutate(signedAttestation())))).toThrow(
      /schema|field|attestation/i,
    );
  });

  it("rejects duplicate member names and non-canonical JSON", () => {
    const attestation = signedAttestation();
    const canonical = `${JSON.stringify(attestation, null, 2)}\n`;
    const duplicate = canonical.replace(
      '  "scheme": "SIP-018-RSV",',
      '  "scheme": "SIP-018-RSV",\n  "scheme": "SIP-018-RSV",',
    );
    const duplicatePath = join(temporaryDirectory(), "duplicate-attestation.json");
    writeFileSync(duplicatePath, duplicate, { flag: "wx", mode: 0o600 });
    expect(() => verify(duplicatePath)).toThrow(/canonical JSON/i);

    const compactPath = join(temporaryDirectory(), "compact-attestation.json");
    writeFileSync(compactPath, `${JSON.stringify(attestation)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    expect(() => verify(compactPath)).toThrow(/canonical JSON/i);
  });
});

describe("mainnet public-read allowlist", () => {
  it("requires a fully synchronized mainnet node with valid anchored tip metadata", () => {
    const valid = {
      network_id: 1,
      is_fully_synced: true,
      burn_block_height: 1,
      stacks_tip_height: 1,
      stacks_tip: "a".repeat(64),
    };
    expect(verifyNodeInfo(valid)).toBe(valid);
    expect(() => verifyNodeInfo({ ...valid, is_fully_synced: false })).toThrow();
    expect(() => verifyNodeInfo({ ...valid, stacks_tip_height: 0 })).toThrow();
    expect(() => verifyNodeInfo({ ...valid, stacks_tip: "invalid" })).toThrow();
  });

  it("permits only the canonical mainnet API and exact read routes", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    const transport = createReadTransport({
      fetchFn: fetch,
      now: () => 10_000,
      sleep: vi.fn(async () => undefined),
    });
    await transport(`${API}/v2/info`);
    await transport(
      `${API}/extended/v1/tx/mempool?address=${DEPLOYER}&limit=1`,
    );
    await transport(
      `${API}/v2/contracts/source/${DEPLOYER}/${CONTRACTS.stx}?proof=0`,
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(transport("https://api.testnet.hiro.so/v2/info")).rejects.toThrow(
      /mainnet origin/,
    );
    await expect(
      transport(`${API}/extended/v1/tx/mempool?address=${treasury}&limit=1`),
    ).rejects.toThrow(/allowlisted/);
    await expect(
      transport(`${API}/v2/contracts/source/${DEPLOYER}/invented?proof=0`),
    ).rejects.toThrow(/allowlisted/);
  });
});

describe("durable mainnet single-broadcast journal", () => {
  const privateKey = randomPrivateKey();
  const sender = getAddressFromPrivateKey(privateKey, "mainnet");
  const args = [Cl.uint(144), Cl.principal(AUTHORITY), Cl.principal(treasury)];
  const intent = {
    kind: "call",
    name: CONTRACTS.stx,
    fn: "initialize-protocol",
    args: args.map(serializeCV),
    sender,
    fee: "200000",
  };
  const buildCall = (nonce = 0n) =>
    makeContractCall({
      contractAddress: DEPLOYER,
      contractName: CONTRACTS.stx,
      functionName: intent.fn,
      functionArgs: args,
      senderKey: privateKey,
      network: STACKS_MAINNET,
      nonce,
      fee: 200_000n,
      postConditionMode: PostConditionMode.Deny,
      postConditions: [],
    });
  const receipt = (id: string, nonce = 0n) => ({
    tx_id: id,
    canonical: true,
    microblock_canonical: true,
    is_unanchored: false,
    tx_status: "success",
    sender_address: sender,
    nonce: Number(nonce),
    fee_rate: "200000",
    sponsored: false,
    anchor_mode: "any",
    post_condition_mode: "deny",
    post_conditions: [],
    tx_type: "contract_call",
    contract_call: {
      contract_id: `${DEPLOYER}.${CONTRACTS.stx}`,
      function_name: "initialize-protocol",
      function_args: intent.args.map((hex) => ({ hex: `0x${hex.replace(/^0x/, "")}` })),
    },
    tx_result: { repr: "(ok true)" },
    block_height: 1,
    burn_block_height: 1,
    block_hash: `0x${"2".repeat(64)}`,
    events: [],
  });

  it("records intent before broadcast and resumes without rebuilding or rebroadcasting", async () => {
    const path = join(temporaryDirectory(), "receipt.json");
    const binding = { test: true };
    const journal = new Journal(path, binding, {
      ...journalOptions,
      campaignStateDir: dirname(path),
    });
    const transaction = await buildCall();
    const id = `0x${transaction.txid()}`;
    const build = vi.fn(async () => transaction);
    let accepted = false;
    const io = {
      info: vi.fn(),
      nonce: vi.fn(async () => 0n),
      lookup: vi.fn(async () => (accepted ? receipt(id) : null)),
      confirmed: vi.fn(async () => receipt(id)),
      broadcast: vi.fn(async () => {
        expect(
          JSON.parse(readFileSync(path, "utf8")).transactions.initialize.txid,
        ).toBe(id);
        accepted = true;
        return { txid: id };
      }),
    };
    try {
      const receiptLock = JSON.parse(readFileSync(`${path}.lock`, "utf8"));
      const accountLock = JSON.parse(
        readFileSync(journalOptions.accountLockPath, "utf8"),
      );
      expect(receiptLock.receipt).toBe(path);
      expect(receiptLock.pid).toBe(process.pid);
      expect(accountLock).toEqual(receiptLock);
      await send(journal, "initialize", intent, build, io);
      await send(journal, "initialize", intent, build, io);
      expect(build).toHaveBeenCalledTimes(1);
      expect(io.broadcast).toHaveBeenCalledTimes(1);
      expect(journal.data.transactions.initialize.intentHash).toBe(
        intentHash(intent),
      );
      expect(journal.data.transactions.initialize.serializedTransaction).toMatch(
        /^[a-f0-9]+$/,
      );
    } finally {
      journal.close();
    }
  });

  it("preserves exact signed bytes across an ambiguous broadcast and resumes byte-identically", async () => {
    const path = join(temporaryDirectory(), "receipt.json");
    const binding = { test: true };
    const journal = new Journal(path, binding, {
      ...journalOptions,
      campaignStateDir: dirname(path),
    });
    const transaction = await buildCall();
    const id = `0x${transaction.txid()}`;
    const firstIo = {
      info: vi.fn(),
      nonce: vi.fn(async () => 0n),
      lookup: vi.fn(async () => null),
      confirmed: vi.fn(async () => receipt(id)),
      broadcast: vi.fn(async () => {
        throw Error("timeout");
      }),
    };
    await expect(send(journal, "initialize", intent, async () => transaction, firstIo)).rejects.toThrow(
      /uncertain/,
    );
    const options = { ...journalOptions, campaignStateDir: dirname(path) };
    expect(() => new Journal(path, binding, options)).toThrow();
    const saved = journal.data.transactions.initialize.serializedTransaction;
    journal.close();
    const resumed = new Journal(path, binding, options);
    const build = vi.fn();
    const resumedIo = {
      info: vi.fn(),
      nonce: vi.fn(),
      lookup: vi.fn(async () => null),
      confirmed: vi.fn(async () => receipt(id)),
      broadcast: vi.fn(async ({ transaction: rebroadcast }) => {
        expect(`0x${rebroadcast.txid()}`).toBe(id);
        return { txid: id };
      }),
    };
    try {
      await send(resumed, "initialize", intent, build, resumedIo);
      expect(build).not.toHaveBeenCalled();
      expect(resumed.data.transactions.initialize.serializedTransaction).toBe(saved);
      expect(resumedIo.broadcast).toHaveBeenCalledTimes(1);
    } finally {
      resumed.close();
    }
    expect(existsSync(path + ".lock")).toBe(false);
  });

  it("permanently binds the campaign cap to one external receipt", () => {
    const directory = temporaryDirectory();
    const path = join(directory, "canonical-receipt.json");
    const binding = {
      sourceCommit: "a".repeat(40),
      dependencyLockHash: "b".repeat(64),
      treasury,
    };
    const options = {
      ...journalOptions,
      campaignStateDir: directory,
    };
    const journal = new Journal(path, binding, options);
    journal.close();
    const marker = join(directory, CAMPAIGN_STATE_FILENAME);
    expect(statSync(marker).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(marker, "utf8")).receiptPath).toBe(path);
    expect(() =>
      new Journal(join(directory, "replacement-receipt.json"), binding, options),
    ).toThrow(/different receipt/);
  });

  it("refuses a mutated payload before broadcast", async () => {
    const path = join(temporaryDirectory(), "receipt.json");
    const journal = new Journal(path, { test: true }, {
      ...journalOptions,
      campaignStateDir: dirname(path),
    });
    const wrong = await makeContractCall({
      contractAddress: DEPLOYER,
      contractName: CONTRACTS.stx,
      functionName: "get-owner",
      functionArgs: [],
      senderKey: privateKey,
      network: STACKS_MAINNET,
      nonce: 0n,
      fee: 200_000n,
      postConditionMode: PostConditionMode.Deny,
      postConditions: [],
    });
    const io = {
      info: vi.fn(),
      nonce: vi.fn(async () => 0n),
      lookup: vi.fn(),
      confirmed: vi.fn(),
      broadcast: vi.fn(),
    };
    try {
      await expect(
        send(journal, "initialize", intent, async () => wrong, io),
      ).rejects.toThrow(/payload/);
      expect(io.broadcast).not.toHaveBeenCalled();
      expect(io.lookup).not.toHaveBeenCalled();
    } finally {
      journal.close();
    }
  });

  it("validates the exact offline deployment source and Clarity version", async () => {
    const deployIntent = {
      ...intentForOperation(operationCatalog(treasury)[0]),
      sender,
    };
    const exact = await makeContractDeploy({
      contractName: CONTRACTS.stx,
      codeBody: source(CONTRACTS.stx),
      senderKey: privateKey,
      network: STACKS_MAINNET,
      nonce: 7n,
      fee: 1_000_000n,
      clarityVersion: 2,
      postConditionMode: PostConditionMode.Deny,
    });
    expect(validateBuiltTransaction(exact, deployIntent, 7n).txid).toMatch(
      /^0x[a-f0-9]{64}$/,
    );
    const wrongSource = await makeContractDeploy({
      contractName: CONTRACTS.stx,
      codeBody: "(define-public (wrong) (ok true))",
      senderKey: privateKey,
      network: STACKS_MAINNET,
      nonce: 7n,
      fee: 1_000_000n,
      clarityVersion: 2,
      postConditionMode: PostConditionMode.Deny,
    });
    expect(() => validateBuiltTransaction(wrongSource, deployIntent, 7n)).toThrow(
      /payload\/source/,
    );
    exact.payload.clarityVersion = 1;
    expect(() => validateBuiltTransaction(exact, deployIntent, 7n)).toThrow(
      /payload\/source/,
    );
  });

  it("accounts for the cumulative campaign fee cap by unique operation", () => {
    const journal = { data: { transactions: {} } };
    expect(campaignFeeTotal(journal, operationCatalog(treasury))).toBe(
      MAXIMUM_TOTAL_FEES,
    );
    journal.data.transactions["invented"] = {
      intent: { fee: String(MAXIMUM_TOTAL_FEES) },
    };
    expect(() => campaignFeeTotal(journal, operationCatalog(treasury))).toThrow(
      /hard cap/,
    );
  });

  it.each([
    ["canonical", false],
    ["microblock_canonical", false],
    ["is_unanchored", true],
    ["tx_status", "abort_by_response"],
    ["sender_address", treasury],
    ["nonce", 1],
    ["fee_rate", "1"],
    ["anchor_mode", "on_chain_only"],
    ["post_condition_mode", "allow"],
    ["post_conditions", [{}]],
    ["sponsored", true],
    ["tx_result", { repr: "(err u1)" }],
  ])("rejects confirmed transaction drift in %s", async (field, value) => {
    const transaction = await buildCall();
    const id = `0x${transaction.txid()}`;
    expect(() =>
      validateTransaction({ ...receipt(id), [field]: value }, id, intent, "0"),
    ).toThrow();
  });
});
