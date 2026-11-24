// Unit tests for nayori-roles, nayori-reputation and nayori-escrow-sbtc.
// Every failure path checks the exact error code.
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
const ESCROW = `${DEPLOYER}.nayori-escrow-sbtc`;
const ROLES = `${DEPLOYER}.nayori-roles`;
const REPUTATION = `${DEPLOYER}.nayori-reputation`;
const FORWARDER = `${DEPLOYER}.phishing-forwarder`;
const PERMISSIONS = `${DEPLOYER}.nayori-permissions`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const HASH = (n) => Cl.bufferFromHex(String(n).padStart(2, "0").repeat(32));
const BUDGET = 1000;

let simnet;
const call = (contract, fn, args, sender) => simnet.callPublicFn(contract, fn, args, sender).result;
const escrow = (fn, args, sender) => call(ESCROW, fn, args, sender);
const read = (contract, fn, args = []) => simnet.callReadOnlyFn(contract, fn, args, DEPLOYER).result;
const sbtc = (who) => Number(read(SBTC, "get-balance", [Cl.principal(who)]).value.value);
const job = (id) => read(ESCROW, "get-job", [Cl.uint(id)]).value.value;
const isOk = (r) => assert.equal(r.type, ClarityType.ResponseOk, `expected ok, got ${cvToString(r)}`);
const isErr = (r, code) => assert.equal(cvToString(r), `(err u${code})`, `expected (err u${code}), got ${cvToString(r)}`);

async function fresh() {
  simnet = await initSimnet(MANIFEST);
  // Give the deployer-side test accounts sBTC where simnet did not.
  for (const who of [CLIENT, PROVIDER, EVALUATOR]) assert.ok(sbtc(who) > 1_000_000, `${who} needs sBTC`);
}

function created({ budget = BUDGET, delivery = 144, review = 12, client = CLIENT, evaluator = EVALUATOR } = {}) {
  const r = escrow("create-job", [Cl.principal(evaluator), Cl.uint(budget), Cl.uint(delivery), Cl.uint(review),
    Cl.stringAscii("test job")], client);
  isOk(r);
  return Number(r.value.value);
}
function funded(opts) { const id = created(opts); isOk(escrow("fund-job", [Cl.uint(id)], CLIENT)); return id; }
function accepted(opts) {
  const id = funded(opts);
  isOk(escrow("name-provider", [Cl.uint(id), Cl.principal(PROVIDER)], CLIENT));
  isOk(escrow("accept-job", [Cl.uint(id)], PROVIDER));
  return id;
}
function submitted(opts) { const id = accepted(opts); isOk(escrow("submit-work", [Cl.uint(id), HASH(9)], PROVIDER)); return id; }
function decided(decision, opts) {
  const id = submitted(opts);
  isOk(escrow("record-decision", [Cl.uint(id), Cl.uint(decision), HASH(1)], EVALUATOR));
  return id;
}

// ---------------------------------------------------------------- roles

test("roles: deployment values and handover only by the holder, after the delay", async () => {
  await fresh();
  assert.equal(read(ROLES, "get-treasury").value, TREASURY);
  assert.equal(read(ROLES, "get-appeal-authority").value, AUTHORITY);
  isErr(call(ROLES, "propose-handover", [Cl.uint(1), Cl.principal(OTHER)], STRANGER), 101);
  isErr(call(ROLES, "propose-handover", [Cl.uint(3), Cl.principal(OTHER)], TREASURY), 100);
  isErr(call(ROLES, "propose-handover", [Cl.uint(1), Cl.principal(AUTHORITY)], TREASURY), 102);
  isOk(call(ROLES, "propose-handover", [Cl.uint(1), Cl.principal(OTHER)], TREASURY));
  isErr(call(ROLES, "accept-handover", [Cl.uint(1)], OTHER), 105);
  simnet.mineEmptyBurnBlocks(144);
  isErr(call(ROLES, "accept-handover", [Cl.uint(1)], STRANGER), 104);
  isOk(call(ROLES, "accept-handover", [Cl.uint(1)], OTHER));
  assert.equal(read(ROLES, "get-treasury").value, OTHER);
  isErr(call(ROLES, "accept-handover", [Cl.uint(1)], OTHER), 103);
});

test("roles: the holder can cancel; a handover cannot make both roles one principal", async () => {
  await fresh();
  isOk(call(ROLES, "propose-handover", [Cl.uint(1), Cl.principal(OTHER)], TREASURY));
  isOk(call(ROLES, "cancel-handover", [Cl.uint(1)], TREASURY));
  isErr(call(ROLES, "cancel-handover", [Cl.uint(1)], TREASURY), 103);
  // Both roles propose the same candidate; the second acceptance must fail.
  isOk(call(ROLES, "propose-handover", [Cl.uint(1), Cl.principal(OTHER)], TREASURY));
  isOk(call(ROLES, "propose-handover", [Cl.uint(2), Cl.principal(OTHER)], AUTHORITY));
  simnet.mineEmptyBurnBlocks(144);
  isOk(call(ROLES, "accept-handover", [Cl.uint(1)], OTHER));
  isErr(call(ROLES, "accept-handover", [Cl.uint(2)], OTHER), 102);
});

test("roles: a forwarding contract cannot propose a handover for the holder", async () => {
  await fresh();
  isErr(call(FORWARDER, "forward-handover", [Cl.principal(OTHER)], TREASURY), 101);
});

// ---------------------------------------------------------------- create and fund

test("create-job: limits and distinct parties", async () => {
  await fresh();
  const create = (evaluator, budget, delivery, review, sender = CLIENT, description = "x") =>
    escrow("create-job", [Cl.principal(evaluator), Cl.uint(budget), Cl.uint(delivery), Cl.uint(review),
      Cl.stringAscii(description)], sender);
  isErr(create(EVALUATOR, 999, 144, 12), 308);
  isErr(create(EVALUATOR, 100_000_001, 144, 12), 308);
  isErr(create(EVALUATOR, 1000, 143, 12), 309);
  isErr(create(EVALUATOR, 1000, 4321, 12), 309);
  isErr(create(EVALUATOR, 1000, 144, 11), 309);
  isErr(create(EVALUATOR, 1000, 144, 1009), 309);
  isErr(create(EVALUATOR, 1000, 144, 12, CLIENT, ""), 310);
  isErr(create(CLIENT, 1000, 144, 12), 307);
  isErr(create(TREASURY, 1000, 144, 12), 307);
  isErr(create(EVALUATOR, 1000, 144, 12, AUTHORITY), 307);
  isOk(create(EVALUATOR, 1000, 4320, 1008));
  const pinned = job(1);
  assert.equal(pinned.treasury.value, TREASURY);
  assert.equal(pinned["appeal-authority"].value, AUTHORITY);
});

test("fund-job: only the client, once, before the deadline, exact budget", async () => {
  await fresh();
  const id = created();
  isErr(escrow("fund-job", [Cl.uint(id)], STRANGER), 302);
  const before = sbtc(CLIENT);
  isOk(escrow("fund-job", [Cl.uint(id)], CLIENT));
  assert.equal(before - sbtc(CLIENT), BUDGET);
  assert.equal(sbtc(ESCROW), BUDGET);
  isErr(escrow("fund-job", [Cl.uint(id)], CLIENT), 301);
  const late = created();
  simnet.mineEmptyBurnBlocks(144);
  isErr(escrow("fund-job", [Cl.uint(late)], CLIENT), 313);
});

// ---------------------------------------------------------------- provider

test("provider: the offer can change until acceptance, then it is fixed", async () => {
  await fresh();
  const id = funded();
  isErr(escrow("name-provider", [Cl.uint(id), Cl.principal(EVALUATOR)], CLIENT), 307);
  isErr(escrow("name-provider", [Cl.uint(id), Cl.principal(TREASURY)], CLIENT), 307);
  isErr(escrow("name-provider", [Cl.uint(id), Cl.principal(PROVIDER)], STRANGER), 302);
  isOk(escrow("name-provider", [Cl.uint(id), Cl.principal(OTHER)], CLIENT));
  isOk(escrow("name-provider", [Cl.uint(id), Cl.principal(PROVIDER)], CLIENT));
  isErr(escrow("accept-job", [Cl.uint(id)], OTHER), 303);
  isOk(escrow("accept-job", [Cl.uint(id)], PROVIDER));
  isErr(escrow("name-provider", [Cl.uint(id), Cl.principal(OTHER)], CLIENT), 301);
  isErr(escrow("submit-work", [Cl.uint(id), HASH(9)], OTHER), 303);
});

test("delivery deadline: no accept or submit after it; refund only after it", async () => {
  await fresh();
  const id = accepted();
  isErr(escrow("refund-no-delivery", [Cl.uint(id)], STRANGER), 314);
  simnet.mineEmptyBurnBlocks(144);
  isErr(escrow("submit-work", [Cl.uint(id), HASH(9)], PROVIDER), 313);
  const before = sbtc(CLIENT);
  isOk(escrow("refund-no-delivery", [Cl.uint(id)], STRANGER));
  assert.equal(sbtc(CLIENT) - before, BUDGET);
  assert.equal(sbtc(ESCROW), 0);
  isErr(escrow("refund-no-delivery", [Cl.uint(id)], STRANGER), 301);
});

test("close-unfunded: only open jobs past the deadline, no funds move", async () => {
  await fresh();
  const id = created();
  isErr(escrow("close-unfunded", [Cl.uint(id)], STRANGER), 314);
  simnet.mineEmptyBurnBlocks(144);
  isOk(escrow("close-unfunded", [Cl.uint(id)], STRANGER));
  assert.equal(job(id).status.value, 10n);
  isErr(escrow("fund-job", [Cl.uint(id)], CLIENT), 301);
});

// ---------------------------------------------------------------- decisions and settlement

test("approve: provider gets budget minus 2%, treasury 2%, reputation recorded, one client rating", async () => {
  await fresh();
  const id = decided(1);
  isErr(escrow("settle-job", [Cl.uint(id)], STRANGER), 314);
  simnet.mineEmptyBurnBlocks(145);
  const provider = sbtc(PROVIDER);
  isOk(escrow("settle-job", [Cl.uint(id)], STRANGER));
  assert.equal(sbtc(PROVIDER) - provider, 980);
  assert.equal(sbtc(TREASURY), 20);
  assert.equal(sbtc(ESCROW), 0);
  isErr(escrow("settle-job", [Cl.uint(id)], STRANGER), 301);
  const stats = read(REPUTATION, "get-provider-stats", [Cl.principal(PROVIDER)]).value;
  assert.equal(stats.completed.value, 1n);
  assert.equal(stats["completed-value-sbtc"].value, 1000n);
  assert.equal(stats["distinct-clients"].value, 1n);
  isErr(escrow("rate-provider", [Cl.uint(id), Cl.uint(5)], EVALUATOR), 302);
  isErr(escrow("rate-provider", [Cl.uint(id), Cl.uint(6)], CLIENT), 205);
  isOk(escrow("rate-provider", [Cl.uint(id), Cl.uint(5)], CLIENT));
  isErr(escrow("rate-provider", [Cl.uint(id), Cl.uint(5)], CLIENT), 204);
});

test("reject: client gets budget minus 2%, no rating allowed", async () => {
  await fresh();
  const id = decided(2);
  simnet.mineEmptyBurnBlocks(145);
  const client = sbtc(CLIENT);
  isOk(escrow("settle-job", [Cl.uint(id)], STRANGER));
  assert.equal(sbtc(CLIENT) - client, 980);
  assert.equal(sbtc(TREASURY), 20);
  isErr(escrow("rate-provider", [Cl.uint(id), Cl.uint(1)], CLIENT), 301);
  assert.equal(read(REPUTATION, "get-provider-stats", [Cl.principal(PROVIDER)]).value.rejected.value, 1n);
});

test("decision window: evaluator only, valid input, before the window closes", async () => {
  await fresh();
  const id = submitted();
  isErr(escrow("record-decision", [Cl.uint(id), Cl.uint(1), HASH(1)], STRANGER), 304);
  isErr(escrow("record-decision", [Cl.uint(id), Cl.uint(3), HASH(1)], EVALUATOR), 311);
  isErr(escrow("record-decision", [Cl.uint(id), Cl.uint(1), HASH(0)], EVALUATOR), 312);
  isErr(escrow("record-default-approval", [Cl.uint(id)], STRANGER), 314);
  simnet.mineEmptyBurnBlocks(13);
  isErr(escrow("record-decision", [Cl.uint(id), Cl.uint(1), HASH(1)], EVALUATOR), 315);
});

test("evaluator silence: default approval, client appeals, authority rejects, client paid", async () => {
  await fresh();
  const id = submitted();
  simnet.mineEmptyBurnBlocks(13);
  isOk(escrow("record-default-approval", [Cl.uint(id)], STRANGER));
  isErr(escrow("appeal", [Cl.uint(id), HASH(3)], PROVIDER), 305);
  isOk(escrow("appeal", [Cl.uint(id), HASH(3)], CLIENT));
  isErr(escrow("resolve-appeal", [Cl.uint(id), Cl.uint(2), HASH(4)], TREASURY), 306);
  const client = sbtc(CLIENT);
  isOk(escrow("resolve-appeal", [Cl.uint(id), Cl.uint(2), HASH(4)], AUTHORITY));
  assert.equal(sbtc(CLIENT) - client, 980);
  assert.equal(sbtc(TREASURY), 20);
});

test("appeal: losing side only, inside the window; unresolved appeal keeps the original decision", async () => {
  await fresh();
  const id = decided(2);
  isErr(escrow("appeal", [Cl.uint(id), HASH(3)], CLIENT), 305);
  isOk(escrow("appeal", [Cl.uint(id), HASH(3)], PROVIDER));
  isErr(escrow("settle-job", [Cl.uint(id)], STRANGER), 314);
  simnet.mineEmptyBurnBlocks(145);
  isErr(escrow("resolve-appeal", [Cl.uint(id), Cl.uint(1), HASH(4)], AUTHORITY), 315);
  const client = sbtc(CLIENT);
  isOk(escrow("settle-job", [Cl.uint(id)], STRANGER));
  assert.equal(sbtc(CLIENT) - client, 980);
  const late = decided(1);
  simnet.mineEmptyBurnBlocks(145);
  isErr(escrow("appeal", [Cl.uint(late), HASH(3)], CLIENT), 315);
});

test("roles are pinned: a later treasury handover does not redirect an existing job's fee", async () => {
  await fresh();
  const id = decided(1);
  isOk(call(ROLES, "propose-handover", [Cl.uint(1), Cl.principal(OTHER)], TREASURY));
  simnet.mineEmptyBurnBlocks(145);
  isOk(call(ROLES, "accept-handover", [Cl.uint(1)], OTHER));
  isOk(escrow("settle-job", [Cl.uint(id)], STRANGER));
  assert.equal(sbtc(TREASURY), 20);
  assert.equal(sbtc(OTHER), 0);
});

// ---------------------------------------------------------------- forwarding contracts

test("permissions: a contract the party never allowed cannot act for it", async () => {
  await fresh();
  const id = funded();
  isErr(call(FORWARDER, "forward-name-provider", [Cl.uint(id), Cl.principal(OTHER)], CLIENT), 302);
  const open = created();
  isErr(call(FORWARDER, "forward-fund", [Cl.uint(open)], CLIENT), 302);
  const sub = submitted();
  isErr(call(FORWARDER, "forward-decision", [Cl.uint(sub)], EVALUATOR), 304);
  const dec = decided(1);
  isErr(call(FORWARDER, "forward-appeal", [Cl.uint(dec)], CLIENT), 305);
  simnet.mineEmptyBurnBlocks(145);
  isOk(escrow("settle-job", [Cl.uint(dec)], STRANGER));
  isErr(call(FORWARDER, "forward-rating", [Cl.uint(dec)], CLIENT), 302);
});

test("permissions: an allowed contract can compose actions; revoking or expiry stops it", async () => {
  await fresh();
  const a = funded();
  const b = funded();
  isErr(call(FORWARDER, "forward-two-offers", [Cl.uint(a), Cl.uint(b), Cl.principal(PROVIDER)], CLIENT), 302);
  isOk(call(PERMISSIONS, "allow-contract-caller", [Cl.principal(FORWARDER), Cl.principal(ESCROW), Cl.none()], CLIENT));
  isOk(call(FORWARDER, "forward-two-offers", [Cl.uint(a), Cl.uint(b), Cl.principal(PROVIDER)], CLIENT));
  assert.equal(job(a).provider.value.value, PROVIDER);
  assert.equal(job(b).provider.value.value, PROVIDER);
  // The allowance is the client's only: the forwarder still cannot act for the evaluator.
  const sub = submitted();
  isErr(call(FORWARDER, "forward-decision", [Cl.uint(sub)], EVALUATOR), 304);
  isOk(call(PERMISSIONS, "disallow-contract-caller", [Cl.principal(FORWARDER), Cl.principal(ESCROW)], CLIENT));
  isErr(call(FORWARDER, "forward-name-provider", [Cl.uint(a), Cl.principal(OTHER)], CLIENT), 302);
  isOk(call(PERMISSIONS, "allow-contract-caller",
    [Cl.principal(FORWARDER), Cl.principal(ESCROW), Cl.some(Cl.uint(simnet.burnBlockHeight + 5))], CLIENT));
  isOk(call(FORWARDER, "forward-name-provider", [Cl.uint(a), Cl.principal(OTHER)], CLIENT));
  simnet.mineEmptyBurnBlocks(5);
  isErr(call(FORWARDER, "forward-name-provider", [Cl.uint(a), Cl.principal(PROVIDER)], CLIENT), 302);
});

test("permissions: only the party, calling directly, can grant an allowance", async () => {
  await fresh();
  isErr(call(FORWARDER, "forward-allow-self", [], CLIENT), 400);
  assert.equal(read(PERMISSIONS, "is-allowed", [Cl.principal(CLIENT), Cl.principal(FORWARDER), Cl.principal(ESCROW)]).type, ClarityType.BoolFalse);
});

test("reputation: only the escrows can write", async () => {
  await fresh();
  isErr(call(REPUTATION, "record-outcome",
    [Cl.uint(1), Cl.principal(PROVIDER), Cl.principal(CLIENT), Cl.bool(true), Cl.uint(1000)], DEPLOYER), 200);
  isErr(call(REPUTATION, "record-rating", [Cl.uint(1), Cl.principal(CLIENT), Cl.uint(5)], CLIENT), 200);
});
