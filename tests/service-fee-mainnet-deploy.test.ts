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
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  Cl,
  PostConditionMode,
  getAddressFromPrivateKey,
  makeContractCall,
  makeContractDeploy,
  randomPrivateKey,
  serializeCV,
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
  validateBuiltTransaction,
  validateTransaction,
  verifyTreasuryCustody,
  verifyRuntimeAttestation,
  verifyNodeInfo,
  verifyConfig,
} from "../scripts/service-fee-mainnet-core.mjs";
import { main as deployMain } from "../scripts/deploy-service-fee-mainnet.mjs";
import { main as createTreasury } from "../scripts/create-service-fee-treasury.mjs";

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
      SERVICE_FEE_MAINNET_TREASURY_ENV_PATH: "/external/treasury.env",
      CONFIRM_SERVICE_FEE_MAINNET_TREASURY_ENV_PATH: "/external/treasury.env",
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
      "CONFIRM_SERVICE_FEE_MAINNET_TREASURY_ENV_PATH",
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

describe("dedicated treasury custody", () => {
  it("creates one external mode-0600 key without printing it or overwriting", () => {
    const path = join(temporaryDirectory(), "mainnet-treasury.env");
    const messages: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message) => messages.push(String(message)));
    const result = createTreasury({
      STACKS_NETWORK: "mainnet",
      CONFIRM_CREATE_MAINNET_TREASURY: "create-dedicated-mainnet-treasury",
      SERVICE_FEE_MAINNET_TREASURY_ENV_PATH: path,
    });
    const contents = readFileSync(path, "utf8");
    const key = contents.match(/NAYORI_MAINNET_TREASURY_PRIVATE_KEY=(.+)/)?.[1];
    expect(result.address).toMatch(/^SP/);
    expect(contents).toContain(`NAYORI_MAINNET_TREASURY_ADDRESS=${result.address}`);
    expect(key).toMatch(/^[a-f0-9]+$/);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(messages.join("\n")).not.toContain(key);
    expect(verifyTreasuryCustody(path, result.address)).toBe(true);
    expect(() => verifyTreasuryCustody(path, otherTreasury)).toThrow(/address differs/);
    expect(() =>
      createTreasury({
        STACKS_NETWORK: "mainnet",
        CONFIRM_CREATE_MAINNET_TREASURY: "create-dedicated-mainnet-treasury",
        SERVICE_FEE_MAINNET_TREASURY_ENV_PATH: path,
      }),
    ).toThrow();
  });

  it("rejects non-mainnet creation before touching the target", () => {
    const path = join(temporaryDirectory(), "must-not-exist.env");
    expect(() =>
      createTreasury({
        STACKS_NETWORK: "testnet",
        CONFIRM_CREATE_MAINNET_TREASURY: "create-dedicated-mainnet-treasury",
        SERVICE_FEE_MAINNET_TREASURY_ENV_PATH: path,
      }),
    ).toThrow(/mainnet/);
    expect(existsSync(path)).toBe(false);
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
