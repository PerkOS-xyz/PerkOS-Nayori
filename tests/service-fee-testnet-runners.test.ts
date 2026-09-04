import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Cl,
  PostConditionMode,
  getAddressFromPrivateKey,
  randomPrivateKey,
  makeContractCall,
} from "@stacks/transactions";
import {
  API,
  DEPLOYER,
  EVALUATOR,
  AUTHORITY,
  CONTRACTS,
  SOURCE_HASHES,
  SBTC,
  NETWORK_ID,
  NETWORK,
  Journal,
  sha256,
  source,
  guard,
  roles,
  principal,
  signer,
  parseEnv,
  ok,
  nonce,
  info,
  verifyConfig,
  verifyTransfers,
  validateTransaction,
  intentHash,
  send,
} from "../scripts/service-fee-testnet-core.mjs";
import {
  SCENARIOS,
  scenario,
  economics,
  deadlineGate,
  fundingRequirements,
  verifyLedger,
  main as e2eMain,
} from "../scripts/e2e-service-fee-testnet.mjs";
import { main as deployMain } from "../scripts/deploy-service-fee-testnet.mjs";

const treasury = "ST1E7E64H8VSSSGE0RPWF90RRC91MQG7CRQRM1BFX";
const provider = "ST10T9RQQX1D1XRGA9QV3J6AP8FDFNTQ1BXJZ3NEP";
const actors = roles(treasury, provider);
const dirs: string[] = [];
function temp() {
  const path = realpathSync(mkdtempSync(join(tmpdir(), "nayori-fee-test-")));
  dirs.push(path);
  return path;
}
afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function event(
  asset: string,
  sender: string,
  recipient: string,
  amount: string,
  index = 0,
) {
  const kind = asset === "stx" ? "stx_asset" : "fungible_token_asset";
  return {
    event_type: kind,
    event_index: index,
    asset: {
      asset_event_type: "transfer",
      sender,
      recipient,
      amount,
      ...(asset === "sbtc" ? { asset_id: `${SBTC}::sbtc-token` } : {}),
    },
  };
}

describe("testnet-only release and custody guards", () => {
  it("pins the two candidate sources and excludes public fault-injection deployments", () => {
    expect(Object.values(CONTRACTS)).toEqual([
      "agentic-commerce-v6",
      "sbtc-commerce-v5",
    ]);
    for (const name of Object.keys(SOURCE_HASHES))
      expect(sha256(source(name))).toBe(SOURCE_HASHES[name]);
    expect(() => source("service-fee-fault-token")).toThrow(/allowlist/);
    expect(NETWORK_ID).toBe(2147483648);
    expect(API).toBe("https://api.testnet.hiro.so");
  });
  it.each([undefined, "mainnet", ""])(
    "rejects network %s before any signer access",
    async (network) => {
      await expect(
        deployMain({
          STACKS_NETWORK: network,
          SERVICE_FEE_DEPLOYER_ENV_PATH: "/must-not-read",
        }),
      ).rejects.toThrow(/testnet/);
      await expect(
        e2eMain({
          STACKS_NETWORK: network,
          SERVICE_FEE_ACTORS_ENV_PATH: "/must-not-read",
        }),
      ).rejects.toThrow(/testnet/);
    },
  );
  it("defaults to preflight, and rejects old acknowledgements or unconfirmed treasury", () => {
    expect(guard({ STACKS_NETWORK: "testnet" }, "deploy")).toBe("preflight");
    expect(() =>
      guard(
        {
          STACKS_NETWORK: "testnet",
          SERVICE_FEE_ACTION: "deploy",
          CONFIRM_SERVICE_FEE_TESTNET: "yes",
        },
        "deploy",
      ),
    ).toThrow(/confirmation/);
    expect(() =>
      guard(
        {
          STACKS_NETWORK: "testnet",
          SERVICE_FEE_ACTION: "deploy",
          CONFIRM_SERVICE_FEE_TESTNET: "deploy-v6-v5-testnet",
          SERVICE_FEE_REVIEWED_SHA: "a".repeat(40),
          SERVICE_FEE_TREASURY_ADDRESS: treasury,
          CONFIRM_SERVICE_FEE_TREASURY: provider,
        },
        "deploy",
      ),
    ).toThrow(/treasury/);
  });
  it.each([DEPLOYER, EVALUATOR, AUTHORITY])(
    "rejects reused treasury role %s",
    (address) => expect(() => roles(address)).toThrow(/distinct/),
  );
  it("rejects reused provider, malformed and mainnet principals", () => {
    expect(() => roles(treasury, treasury)).toThrow(/distinct/);
    expect(() => principal("ST-invalid")).toThrow(/testnet principal/);
    expect(() => principal("SP000000000000000000002Q6VF78")).toThrow(
      /testnet principal/,
    );
  });
  it("decodes typed nested CVs without converting bools into truthy strings", () => {
    expect(
      ok(
        Cl.ok(
          Cl.tuple({
            configured: Cl.bool(false),
            n: Cl.uint(3),
            opt: Cl.some(Cl.uint(2)),
            none: Cl.none(),
          }),
        ),
      ),
    ).toEqual({ configured: false, n: "3", opt: "2", none: null });
    expect(() => ok(Cl.error(Cl.uint(829)))).toThrow(/successful/);
  });
  it("parses quoted values but rejects duplicate key fields", () => {
    expect(parseEnv('# test\nFOO="bar=x"\n').FOO).toBe("bar=x");
    expect(() => parseEnv("FOO=a\nFOO=b")).toThrow(/duplicate/);
    expect(() => parseEnv("export FOO=a")).toThrow(/Invalid/);
  });
  it("loads only a mode-600 matching signer; symlinks and broad permissions fail", () => {
    const dir = temp(),
      path = join(dir, "qa.env"),
      key = randomPrivateKey(),
      address = getAddressFromPrivateKey(key, "testnet");
    writeFileSync(path, `QA_KEY=${key}\n`, { mode: 0o600 });
    expect(signer(path, address, "QA_KEY")).toBe(key);
    expect(() => signer(path, DEPLOYER, "QA_KEY")).toThrow(/does not match/);
    chmodSync(path, 0o644);
    expect(() => signer(path, address, "QA_KEY")).toThrow(/0600/);
    chmodSync(path, 0o600);
    symlinkSync(path, join(dir, "link.env"));
    expect(() => signer(join(dir, "link.env"), address, "QA_KEY")).toThrow(
      /symlink/,
    );
  });
  it.each([
    "treasury",
    "appeal-authority",
    "appeal-window",
    "review-window",
    "service-fee-bps",
    "configured",
  ])("rejects policy drift in %s", (field) => {
    const policy = {
      configured: true,
      treasury,
      "appeal-authority": AUTHORITY,
      "appeal-window": "3",
      "review-window": "12",
      "service-fee-bps": "200",
    };
    expect(() => verifyConfig(policy, treasury)).not.toThrow();
    expect(() =>
      verifyConfig({ ...policy, [field]: "wrong" }, treasury),
    ).toThrow(/configuration/);
  });
});

describe("public node and nonce preflight", () => {
  it("rejects a node that responds with mainnet identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ network_id: 1, burn_block_height: 100 }),
          ),
      ),
    );
    await expect(info()).rejects.toThrow(/identity/);
  });
  it("accepts nonce zero for a new wallet without inventing a consumed nonce", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes("mempool?")
                ? { total: 0 }
                : {
                    possible_next_nonce: 0,
                    last_executed_tx_nonce: null,
                    detected_missing_nonces: [],
                    detected_mempool_nonces: [],
                  },
            ),
          ),
      ),
    );
    expect(await nonce(treasury)).toBe(0n);
  });
  it("refuses pending transactions before fetching/signing a nonce", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ total: 1 })));
    vi.stubGlobal("fetch", fetch);
    await expect(nonce(DEPLOYER)).rejects.toThrow(/pending/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("refuses nonce gaps even when mempool total is zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes("mempool?")
                ? { total: 0 }
                : {
                    possible_next_nonce: 8,
                    last_executed_tx_nonce: 5,
                    detected_missing_nonces: [6, 7],
                    detected_mempool_nonces: [],
                  },
            ),
          ),
      ),
    );
    await expect(nonce(DEPLOYER)).rejects.toThrow(/contiguous/);
  });
});

describe("20-scenario accounting oracle (unit tests, not on-chain E2E)", () => {
  for (const asset of ["stx", "sbtc"]) {
    for (const name of Object.keys(SCENARIOS)) {
      it(`${asset} ${name}: exact recipients, charge, waiver and refund`, () => {
        const spec = scenario(asset, name),
          e = economics(spec, actors),
          sender = `${DEPLOYER}.${spec.contract}`;
        const legs = [
          { sender, recipient: e.recipient, amount: String(e.net) },
          ...(e.charged
            ? [{ sender, recipient: treasury, amount: String(e.charged) }]
            : []),
        ];
        const events = legs.map((leg, index) =>
          event(asset, leg.sender, leg.recipient, leg.amount, index),
        );
        expect(() => verifyTransfers(events, asset, legs)).not.toThrow();
        expect(e.net + e.charged).toBe(spec.budget);
        const policy = {
          "basis-points": "200",
          treasury,
          "fee-amount": String(spec.budget / 50n),
          "service-recorded": spec.wait !== "review",
          waiver: spec.waiver || spec.refund ? "0x01" : null,
          settlement:
            spec.wait === "review"
              ? null
              : {
                  gross: String(e.gross),
                  recipient: e.recipient,
                  net: String(e.net),
                  "charged-fee": String(e.charged),
                  "refunded-fee": String(e.refunded),
                },
        };
        expect(() => verifyLedger(policy, spec, actors)).not.toThrow();
        expect(() =>
          verifyLedger({ ...policy, treasury: DEPLOYER }, spec, actors),
        ).toThrow(/policy/);
        if (spec.refund) {
          const refund = [
            {
              sender: treasury,
              recipient: e.recipient,
              amount: String(e.charged),
            },
          ];
          expect(() =>
            verifyTransfers(
              [event(asset, treasury, e.recipient, String(e.charged))],
              asset,
              refund,
            ),
          ).not.toThrow();
          expect(() =>
            verifyLedger(
              {
                ...policy,
                settlement: { ...policy.settlement, "refunded-fee": "0" },
              },
              spec,
              actors,
            ),
          ).toThrow(/ledger/);
        }
      });
    }
  }
  it("rejects wrong recipient, token, missing leg, extra leg and duplicated payout", () => {
    const legs = [
      { sender: DEPLOYER, recipient: provider, amount: "980" },
      { sender: DEPLOYER, recipient: treasury, amount: "20" },
    ];
    const valid = [
      event("sbtc", DEPLOYER, provider, "980"),
      event("sbtc", DEPLOYER, treasury, "20", 1),
    ];
    for (const altered of [
      valid.slice(0, 1),
      [...valid, valid[0]],
      [event("sbtc", DEPLOYER, EVALUATOR, "980"), valid[1]],
      [event("sbtc", DEPLOYER, provider, "1000"), valid[1]],
    ])
      expect(() => verifyTransfers(altered, "sbtc", legs)).toThrow(/legs/);
    expect(() =>
      verifyTransfers(
        [event("stx", DEPLOYER, provider, "980"), valid[1]],
        "sbtc",
        legs,
      ),
    ).toThrow(/asset/);
    const wrong = event("sbtc", DEPLOYER, provider, "980");
    wrong.asset.asset_id = "other.token::token";
    expect(() => verifyTransfers([wrong, valid[1]], "sbtc", legs)).toThrow(
      /monetary/,
    );
  });
  it("requires strictly greater burn height, including exact boundary", () => {
    expect(deadlineGate(100, 101)).toEqual({
      ready: false,
      blocksRemaining: "2",
      requiredBurnHeight: "102",
    });
    expect(deadlineGate(101, 101).ready).toBe(false);
    expect(deadlineGate(102, 101).ready).toBe(true);
    expect(() => deadlineGate(102, null)).toThrow(/Missing/);
  });
  it("does not turn unknown assets/scenarios into STX defaults", () => {
    expect(() => scenario("usdcx", "approve-no-appeal")).toThrow(/Unknown/);
    expect(() => scenario("stx", "invented")).toThrow(/Unknown/);
    expect(Object.keys(SCENARIOS)).toHaveLength(10);
  });
  it("requires refund gas in treasury before opening escrow, not an automatic debit", () => {
    const amounts = fundingRequirements(scenario("sbtc", "refund-approve"));
    expect(amounts.treasury).toBe(5000n);
    expect(amounts.provider).toBe(10000n);
    expect(amounts.client).toBe(30000n);
    expect(
      fundingRequirements(scenario("stx", "approve-no-appeal")).client,
    ).toBe(130000n);
  });
});

describe("durable single-broadcast execution", () => {
  it("constructs a real signed testnet transaction offline with nonce zero and deny mode", async () => {
    const fetch = vi.fn(async () => {
      throw Error("Unexpected network access");
    });
    vi.stubGlobal("fetch", fetch);
    const tx = await makeContractCall({
      contractAddress: DEPLOYER,
      contractName: CONTRACTS.stx,
      functionName: "fund-job",
      functionArgs: [Cl.uint(1)],
      senderKey: randomPrivateKey(),
      network: NETWORK,
      nonce: 0n,
      fee: 5000n,
      postConditionMode: PostConditionMode.Deny,
    });
    expect(tx.chainId).toBe(NETWORK_ID);
    expect(tx.postConditionMode).toBe(PostConditionMode.Deny);
    expect(tx.txid()).toMatch(/^[a-f0-9]{64}$/);
    expect(fetch).not.toHaveBeenCalled();
  });
  const id = `0x${"1".repeat(64)}`;
  const intent = {
    kind: "call",
    name: CONTRACTS.stx,
    fn: "fund-job",
    args: [],
    sender: DEPLOYER,
    fee: "5000",
  };
  const receipt = () => ({
    tx_id: id,
    canonical: true,
    is_unanchored: false,
    tx_status: "success",
    sender_address: DEPLOYER,
    fee_rate: "5000",
    sponsored: false,
    post_condition_mode: "deny",
    tx_type: "contract_call",
    contract_call: {
      contract_id: `${DEPLOYER}.${CONTRACTS.stx}`,
      function_name: "fund-job",
      function_args: [],
    },
    tx_result: { repr: "(ok true)" },
    block_height: 1,
    burn_block_height: 1,
  });
  const transaction = {
    chainId: NETWORK_ID,
    postConditionMode: PostConditionMode.Deny,
    txid: () => id.slice(2),
  };
  it("persists intent before broadcast and resumes by observing, never re-signing", async () => {
    const path = join(temp(), "receipt.json"),
      journal = new Journal(path, { test: true }),
      build = vi.fn(async () => transaction);
    const io = {
      info: vi.fn(),
      nonce: vi.fn(async () => 0n),
      confirmed: vi.fn(async () => receipt()),
      broadcast: vi.fn(async () => {
        expect(
          JSON.parse(readFileSync(path, "utf8")).transactions.fund.txid,
        ).toBe(id);
        return { txid: id };
      }),
    };
    try {
      await send(journal, "fund", intent, build, io);
      await send(journal, "fund", intent, build, io);
      expect(io.broadcast).toHaveBeenCalledTimes(1);
      expect(build).toHaveBeenCalledTimes(1);
      expect(journal.data.transactions.fund.intentHash).toBe(
        intentHash(intent),
      );
    } finally {
      journal.close();
    }
  });
  it("preserves ambiguous txid across process restart without rebroadcast", async () => {
    const path = join(temp(), "receipt.json"),
      binding = { test: true },
      journal = new Journal(path, binding);
    const io = {
      info: vi.fn(),
      nonce: vi.fn(async () => 0n),
      confirmed: vi.fn(async () => receipt()),
      broadcast: vi.fn(async () => {
        throw Error("timeout");
      }),
    };
    await expect(
      send(journal, "fund", intent, async () => transaction, io),
    ).rejects.toThrow(/uncertain/);
    journal.close();
    const resumed = new Journal(path, binding),
      build = vi.fn();
    try {
      await send(resumed, "fund", intent, build, io);
      expect(build).not.toHaveBeenCalled();
      expect(io.broadcast).toHaveBeenCalledTimes(1);
    } finally {
      resumed.close();
    }
  });
  it("blocks a changed intent and concurrent journal execution", async () => {
    const path = join(temp(), "receipt.json"),
      binding = { test: true },
      journal = new Journal(path, binding);
    try {
      expect(() => new Journal(path, binding)).toThrow();
      expect(
        () => new Journal(join(temp(), "another-run.json"), binding),
      ).toThrow();
      journal.data.transactions.fund = {
        txid: id,
        intentHash: intentHash(intent),
      };
      journal.save();
      await expect(
        send(journal, "fund", { ...intent, fee: "9999" }, vi.fn()),
      ).rejects.toThrow(/intent changed/);
    } finally {
      journal.close();
    }
    expect(() => new Journal(path, { test: false })).toThrow(/different/);
    expect(existsSync(path + ".lock")).toBe(false);
  });
  it.each([
    "canonical",
    "is_unanchored",
    "tx_status",
    "sender_address",
    "fee_rate",
  ])("rejects noncanonical/mismatched %s", (field) => {
    const wrong = {
      ...receipt(),
      [field]:
        field === "canonical"
          ? false
          : field === "is_unanchored"
            ? true
            : "wrong",
    };
    expect(() => validateTransaction(wrong, id, intent)).toThrow();
  });
});
