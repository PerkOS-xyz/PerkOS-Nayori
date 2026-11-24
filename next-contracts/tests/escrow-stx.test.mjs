// Unit tests for nayori-escrow-stx: same rules as the sBTC escrow, native STX.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initSimnet } from "@stacks/clarinet-sdk";
import { Cl, ClarityType, cvToString } from "@stacks/transactions";

const MANIFEST = join(dirname(fileURLToPath(import.meta.url)), "Clarinet.toml");
const DEPLOYER = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const CLIENT = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const PROVIDER = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";
const EVALUATOR = "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC";
const TREASURY = "ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND";
const AUTHORITY = "ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB";
const STRANGER = "ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0";
const OTHER = "ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ";
const STX_ESCROW = `${DEPLOYER}.nayori-escrow-stx`;
const SBTC_ESCROW = `${DEPLOYER}.nayori-escrow-sbtc`;
const REPUTATION = `${DEPLOYER}.nayori-reputation`;
const FORWARDER = `${DEPLOYER}.phishing-forwarder`;
const HASH = (n) => Cl.bufferFromHex(String(n).padStart(2, "0").repeat(32));
const BUDGET = 1_000_000; // 1 STX in micro-STX

let simnet;
const call = (contract, fn, args, sender) => simnet.callPublicFn(contract, fn, args, sender).result;
const stx = (fn, args, sender) => call(STX_ESCROW, fn, args, sender);
const read = (contract, fn, args = []) => simnet.callReadOnlyFn(contract, fn, args, DEPLOYER).result;
const balance = (who) => Number(simnet.getAssetsMap().get("STX")?.get(who) ?? 0n);
const isOk = (r) => assert.equal(r.type, ClarityType.ResponseOk, `expected ok, got ${cvToString(r)}`);
const isErr = (r, code) => assert.equal(cvToString(r), `(err u${code})`, `expected (err u${code}), got ${cvToString(r)}`);

async function fresh() { simnet = await initSimnet(MANIFEST); }

function decided(decision, contract = STX_ESCROW, budget = BUDGET) {
  const r = call(contract, "create-job", [Cl.principal(EVALUATOR), Cl.uint(budget), Cl.uint(144), Cl.uint(12),
    Cl.stringAscii("job")], CLIENT);
  isOk(r);
  const id = Number(r.value.value);
  isOk(call(contract, "fund-job", [Cl.uint(id)], CLIENT));
  isOk(call(contract, "name-provider", [Cl.uint(id), Cl.principal(PROVIDER)], CLIENT));
  isOk(call(contract, "accept-job", [Cl.uint(id)], PROVIDER));
  isOk(call(contract, "submit-work", [Cl.uint(id), HASH(9)], PROVIDER));
  isOk(call(contract, "record-decision", [Cl.uint(id), Cl.uint(decision), HASH(1)], EVALUATOR));
  return id;
}

test("stx: budget bounds in micro-STX", async () => {
  await fresh();
  const create = (budget) => stx("create-job", [Cl.principal(EVALUATOR), Cl.uint(budget), Cl.uint(144), Cl.uint(12),
    Cl.stringAscii("x")], CLIENT);
  isErr(create(999_999), 308);
  isErr(create(100_000_000_001), 308);
  isOk(create(1_000_000));
});

test("stx: funding moves exactly the budget; approval pays 98% and 2%", async () => {
  await fresh();
  const client = balance(CLIENT);
  const id = decided(1);
  assert.equal(client - balance(CLIENT), BUDGET);
  assert.equal(balance(STX_ESCROW), BUDGET);
  simnet.mineEmptyBurnBlocks(145);
  const provider = balance(PROVIDER);
  isOk(stx("settle-job", [Cl.uint(id)], STRANGER));
  assert.equal(balance(PROVIDER) - provider, 980_000);
  assert.equal(balance(TREASURY), 20_000);
  assert.equal(balance(STX_ESCROW), 0);
  isErr(stx("settle-job", [Cl.uint(id)], STRANGER), 301);
});

test("stx: rejection pays the client 98%; no delivery refunds 100%", async () => {
  await fresh();
  const id = decided(2);
  simnet.mineEmptyBurnBlocks(145);
  let client = balance(CLIENT);
  isOk(stx("settle-job", [Cl.uint(id)], STRANGER));
  assert.equal(balance(CLIENT) - client, 980_000);
  const r = stx("create-job", [Cl.principal(EVALUATOR), Cl.uint(BUDGET), Cl.uint(144), Cl.uint(12), Cl.stringAscii("x")], CLIENT);
  const late = Number(r.value.value);
  isOk(stx("fund-job", [Cl.uint(late)], CLIENT));
  simnet.mineEmptyBurnBlocks(144);
  client = balance(CLIENT);
  isOk(stx("refund-no-delivery", [Cl.uint(late)], STRANGER));
  assert.equal(balance(CLIENT) - client, BUDGET);
});

test("stx: a contract the party never allowed cannot act for it", async () => {
  await fresh();
  const r = stx("create-job", [Cl.principal(EVALUATOR), Cl.uint(BUDGET), Cl.uint(144), Cl.uint(12), Cl.stringAscii("x")], CLIENT);
  isOk(r);
  isErr(call(FORWARDER, "forward-fund-stx", [r.value], CLIENT), 302);
  isErr(stx("fund-job", [r.value], STRANGER), 302);
});

test("reputation: STX and sBTC jobs with the same id stay apart, value kept per asset", async () => {
  await fresh();
  const a = decided(1, STX_ESCROW, BUDGET);
  const b = decided(1, SBTC_ESCROW, 1000);
  assert.equal(a, 1);
  assert.equal(b, 1);
  simnet.mineEmptyBurnBlocks(145);
  isOk(stx("settle-job", [Cl.uint(a)], STRANGER));
  isOk(call(SBTC_ESCROW, "settle-job", [Cl.uint(b)], STRANGER));
  const stats = read(REPUTATION, "get-provider-stats", [Cl.principal(PROVIDER)]).value;
  assert.equal(stats.completed.value, 2n);
  assert.equal(stats["completed-value-stx"].value, BigInt(BUDGET));
  assert.equal(stats["completed-value-sbtc"].value, 1000n);
  assert.equal(stats["distinct-clients"].value, 1n);
  isOk(stx("rate-provider", [Cl.uint(a), Cl.uint(4)], CLIENT));
  isOk(call(SBTC_ESCROW, "rate-provider", [Cl.uint(b), Cl.uint(5)], CLIENT));
  void OTHER; void AUTHORITY;
});
