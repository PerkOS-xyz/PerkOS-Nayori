// Unit tests for nayori-agents and nayori-applications, including the capped,
// deposit-sorted list (I3: a full list always admits a higher deposit).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initSimnet } from "@stacks/clarinet-sdk";
import { Cl, ClarityType, cvToString, randomPrivateKey, privateKeyToAddress } from "@stacks/transactions";

const MANIFEST = join(dirname(fileURLToPath(import.meta.url)), "Clarinet.toml");
const DEPLOYER = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const CLIENT = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const PROVIDER = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";
const EVALUATOR = "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC";
const STRANGER = "ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0";
const ESCROW = `${DEPLOYER}.nayori-escrow-sbtc`;
const AGENTS = `${DEPLOYER}.nayori-agents`;
const APPS = `${DEPLOYER}.nayori-applications`;
const PERMISSIONS = `${DEPLOYER}.nayori-permissions`;
const FORWARDER = `${DEPLOYER}.phishing-forwarder`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";

let simnet;
const call = (contract, fn, args, sender) => simnet.callPublicFn(contract, fn, args, sender).result;
const read = (contract, fn, args = []) => simnet.callReadOnlyFn(contract, fn, args, DEPLOYER).result;
const sbtc = (who) => Number(read(SBTC, "get-balance", [Cl.principal(who)]).value.value);
const isOk = (r) => assert.equal(r.type, ClarityType.ResponseOk, `expected ok, got ${cvToString(r)}`);
const isErr = (r, code) => assert.equal(cvToString(r), `(err u${code})`, `expected (err u${code}), got ${cvToString(r)}`);
const list = (job) => read(APPS, "get-applications", [Cl.uint(job)]).value.map((e) => ({
  applicant: e.value.applicant.value, deposit: Number(e.value.deposit.value) }));
const sumDeposits = () => {
  let total = 0;
  const jobs = Number(read(ESCROW, "get-job-count").value);
  for (let j = 1; j <= jobs; j += 1) total += list(j).reduce((a, e) => a + e.deposit, 0);
  return total;
};

async function fresh() { simnet = await initSimnet(MANIFEST); }

function openJob() {
  const r = call(ESCROW, "create-job", [Cl.principal(EVALUATOR), Cl.uint(1000), Cl.uint(144), Cl.uint(12),
    Cl.stringAscii("job")], CLIENT);
  isOk(r);
  return Number(r.value.value);
}

// A funded, registered agent at a fresh address.
function newAgent(funding = 2_000_000) {
  const address = privateKeyToAddress(randomPrivateKey(), "testnet");
  isOk(call(SBTC, "transfer", [Cl.uint(funding), Cl.principal(CLIENT), Cl.principal(address), Cl.none()], CLIENT));
  isOk(call(AGENTS, "register", [Cl.stringAscii("agent"), Cl.stringAscii("")], address));
  return address;
}

const apply = (job, deposit, who) => call(APPS, "apply-to-job", [Cl.uint(job), Cl.uint(deposit)], who);

test("agents: one per wallet, the registrant is the wallet, update by the agent", async () => {
  await fresh();
  isErr(call(AGENTS, "register", [Cl.stringAscii(""), Cl.stringAscii("")], PROVIDER), 503);
  isOk(call(AGENTS, "register", [Cl.stringAscii("p"), Cl.stringAscii("u")], PROVIDER));
  isErr(call(AGENTS, "register", [Cl.stringAscii("p"), Cl.stringAscii("u")], PROVIDER), 501);
  assert.equal(read(AGENTS, "get-agent", [Cl.principal(PROVIDER)]).value.value.name.value, "p");
  isErr(call(AGENTS, "update", [Cl.stringAscii("x"), Cl.stringAscii("")], STRANGER), 502);
  isOk(call(AGENTS, "update", [Cl.stringAscii("x"), Cl.stringAscii("")], PROVIDER));
  assert.equal(read(AGENTS, "get-agent-count").value, 1n);
});

test("apply: registered agents only, deposit bounds, not the client, once per job", async () => {
  await fresh();
  const job = openJob();
  isErr(apply(job, 100, PROVIDER), 601);
  isOk(call(AGENTS, "register", [Cl.stringAscii("p"), Cl.stringAscii("")], PROVIDER));
  isOk(call(AGENTS, "register", [Cl.stringAscii("c"), Cl.stringAscii("")], CLIENT));
  isErr(apply(job, 99, PROVIDER), 605);
  isErr(apply(job, 1_000_001, PROVIDER), 605);
  isErr(apply(job, 100, CLIENT), 610);
  isErr(apply(99, 100, PROVIDER), 602);
  const before = sbtc(PROVIDER);
  isOk(apply(job, 250, PROVIDER));
  assert.equal(before - sbtc(PROVIDER), 250);
  isErr(apply(job, 300, PROVIDER), 606);
  assert.equal(sbtc(APPS), sumDeposits());
});

test("list: sorted by deposit, ties keep arrival order", async () => {
  await fresh();
  const job = openJob();
  const [a, b, c, d] = [newAgent(), newAgent(), newAgent(), newAgent()];
  isOk(apply(job, 200, a));
  isOk(apply(job, 500, b));
  isOk(apply(job, 300, c));
  isOk(apply(job, 300, d));
  assert.deepEqual(list(job).map((e) => e.applicant), [b, c, d, a]);
});

test("I3: a full list admits a higher deposit and refunds the lowest; an equal deposit is refused", async () => {
  await fresh();
  const job = openJob();
  const agents = [];
  for (let i = 0; i < 50; i += 1) {
    const agent = newAgent();
    isOk(apply(job, 100 + i, agent));
    agents.push(agent);
  }
  assert.equal(list(job).length, 50);
  const lowest = agents[0];
  const newcomer = newAgent();
  isErr(apply(job, 100, newcomer), 607);
  const lowestBefore = sbtc(lowest);
  isOk(apply(job, 1000, newcomer));
  assert.equal(sbtc(lowest) - lowestBefore, 100, "displaced applicant refunded exactly");
  const after = list(job);
  assert.equal(after.length, 50);
  assert.equal(after[0].applicant, newcomer);
  assert.ok(!after.some((e) => e.applicant === lowest));
  assert.equal(sbtc(APPS), sumDeposits());
});

test("withdraw, decline and release return the exact deposit to the applicant", async () => {
  await fresh();
  const job = openJob();
  const [a, b, c] = [newAgent(), newAgent(), newAgent()];
  isOk(apply(job, 300, a));
  isOk(apply(job, 400, b));
  isOk(apply(job, 500, c));
  let before = sbtc(a);
  isOk(call(APPS, "withdraw", [Cl.uint(job)], a));
  assert.equal(sbtc(a) - before, 300);
  isErr(call(APPS, "withdraw", [Cl.uint(job)], a), 608);
  isErr(call(APPS, "decline", [Cl.uint(job), Cl.principal(b)], STRANGER), 609);
  before = sbtc(b);
  isOk(call(APPS, "decline", [Cl.uint(job), Cl.principal(b)], CLIENT));
  assert.equal(sbtc(b) - before, 400);
  isErr(call(APPS, "release", [Cl.uint(job), Cl.principal(c)], STRANGER), 604);
  // The client hires c directly; the job stops taking applications.
  isOk(call(ESCROW, "fund-job", [Cl.uint(job)], CLIENT));
  isOk(call(ESCROW, "name-provider", [Cl.uint(job), Cl.principal(c)], CLIENT));
  isOk(call(ESCROW, "accept-job", [Cl.uint(job)], c));
  isErr(apply(job, 200, newAgent()), 603);
  before = sbtc(c);
  isOk(call(APPS, "release", [Cl.uint(job), Cl.principal(c)], STRANGER));
  assert.equal(sbtc(c) - before, 500);
  assert.equal(sbtc(APPS), 0);
});

test("composition: an agent applies to two jobs in one call through a contract it allowed", async () => {
  await fresh();
  const [j1, j2] = [openJob(), openJob()];
  const agent = newAgent();
  isErr(call(FORWARDER, "forward-two-applications", [Cl.uint(j1), Cl.uint(j2), Cl.uint(150)], agent), 600);
  isOk(call(PERMISSIONS, "allow-contract-caller", [Cl.principal(FORWARDER), Cl.principal(APPS), Cl.none()], agent));
  isOk(call(FORWARDER, "forward-two-applications", [Cl.uint(j1), Cl.uint(j2), Cl.uint(150)], agent));
  assert.equal(list(j1)[0].applicant, agent);
  assert.equal(list(j2)[0].applicant, agent);
  assert.equal(sbtc(APPS), 300);
});
