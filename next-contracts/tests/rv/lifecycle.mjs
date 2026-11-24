// Stateful lifecycle campaign for the next-version contracts.
//
// Rendezvous picks callers and functions uniformly, so a job seldom walks all
// its steps and applications never start (they need jobs and agents from other
// contracts). This campaign generates whole action sequences with fast-check
// across the sBTC escrow, applications, agents and roles: four actions in five
// go to a job whose state allows them, sent by the account holding the role;
// the rest go to any job from any account. Burn blocks are mined as an action.
// After every action, every simnet invariant of the escrow and applications
// contracts must hold, and the run fails if any key path never succeeds.
//
// Usage (from next/): node tests/rv/lifecycle.mjs [--runs N] [--seed S]
import { initSimnet } from "@stacks/clarinet-sdk";
import { Cl, ClarityType, cvToString } from "@stacks/transactions";
import fc from "fast-check";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const RUNS = arg("runs", 30);
const SEED = arg("seed", Date.now() % 2 ** 31);
const MANIFEST = join(dirname(fileURLToPath(import.meta.url)), "..", "Clarinet.toml");

const DEPLOYER = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const ACCOUNTS = [
  DEPLOYER,
  "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5",
  "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG",
  "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC",
];
const TREASURY = "ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND";
const AUTHORITY = "ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB";
const STRANGER = "ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0";
const ALL = [...ACCOUNTS, TREASURY, AUTHORITY, STRANGER];
const ESCROW = `${DEPLOYER}.nayori-escrow-sbtc`;
const APPS = `${DEPLOYER}.nayori-applications`;
const AGENTS = `${DEPLOYER}.nayori-agents`;
const INVARIANTS = [
  [ESCROW, "invariant-balance-equals-escrows"],
  [ESCROW, "invariant-jobs-consistent"],
  [ESCROW, "invariant-harness-capacity"],
  [APPS, "invariant-balance-equals-deposits"],
  [APPS, "invariant-lists-well-formed"],
];
const MUST_SUCCEED = [
  "create-job", "fund-job", "name-provider", "accept-job", "submit-work", "record-decision",
  "record-default-approval", "appeal", "resolve-appeal", "settle-job", "refund-no-delivery",
  "close-unfunded", "rate-provider", "register", "apply-to-job", "withdraw", "decline", "release",
];

let simnet;
const successes = new Map();
const read = (contract, fn, args = []) => simnet.callReadOnlyFn(contract, fn, args, DEPLOYER).result;
const hash = (n) => Cl.bufferFromHex((n % 2 ** 32 + 1).toString(16).padStart(8, "0").repeat(8));

const jobOf = (id) => {
  const r = read(ESCROW, "get-job", [Cl.uint(id)]);
  if (r.type !== ClarityType.OptionalSome) return undefined;
  const j = r.value.value;
  const decision = read(ESCROW, "get-decision", [Cl.uint(id)]);
  return {
    status: Number(j.status.value),
    client: j.client.value,
    evaluator: j.evaluator.value,
    provider: j.provider.type === ClarityType.OptionalSome ? j.provider.value.value : undefined,
    approved: decision.type === ClarityType.OptionalSome && decision.value.value.decision.value === 1n,
  };
};

// Escrow statuses: 0 open, 1 funded, 2 offered, 3 accepted, 4 submitted,
// 5 decided, 6 disputed, 7 completed, 8 rejected, 9 refunded, 10 expired.
const READY = {
  "fund-job": (j) => j.status === 0,
  "name-provider": (j) => j.status === 1 || j.status === 2,
  "accept-job": (j) => j.status === 2,
  "submit-work": (j) => j.status === 3,
  "record-decision": (j) => j.status === 4,
  "record-default-approval": (j) => j.status === 4,
  appeal: (j) => j.status === 5,
  "resolve-appeal": (j) => j.status === 6,
  "settle-job": (j) => j.status === 5 || j.status === 6,
  "refund-no-delivery": (j) => j.status >= 1 && j.status <= 3,
  "close-unfunded": (j) => j.status === 0,
  "rate-provider": (j) => j.status === 7,
  "apply-to-job": (j) => j.status <= 2,
  withdraw: () => true,
  decline: () => true,
  release: (j) => j.status > 2,
};

const pickJob = (a, count) => {
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  const ready = ids.filter((id) => READY[a.kind](jobOf(id)));
  if (a.pick < 80 && ready.length > 0) return ready[a.pick % ready.length];
  return (a.pick % count) + 1;
};
const sender = (role, who) => (role !== undefined && who < 80 ? role : ALL[who % ALL.length]);
const other = (job, n) => ACCOUNTS.filter((p) => p !== job.client && p !== job.evaluator)[n % 2];

const actionArb = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("create"), roles: fc.shuffledSubarray([0, 1, 2, 3], { minLength: 2, maxLength: 2 }),
    budget: fc.integer({ min: 1000, max: 50000 }), delivery: fc.integer({ min: 144, max: 400 }), review: fc.integer({ min: 12, max: 60 }) }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("register"), who: fc.nat(3) }) },
  { weight: 70, arbitrary: fc.record({ kind: fc.constantFrom(...Object.keys(READY)), pick: fc.nat(99), who: fc.nat(99),
    value: fc.nat(1000), seed: fc.nat() }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("handover"), step: fc.nat(2) }) },
  { weight: 12, arbitrary: fc.record({ kind: fc.constant("mine"), blocks: fc.oneof(
    { weight: 4, arbitrary: fc.integer({ min: 1, max: 12 }) }, { weight: 1, arbitrary: fc.integer({ min: 40, max: 200 }) }) }) },
);

const plan = (a, count) => {
  if (a.kind === "create") {
    const [c, e] = a.roles.map((i) => ACCOUNTS[i]);
    return [ESCROW, "create-job", [Cl.principal(e), Cl.uint(a.budget), Cl.uint(a.delivery), Cl.uint(a.review), Cl.stringAscii("job")], c];
  }
  if (a.kind === "register") return [AGENTS, "register", [Cl.stringAscii("agent"), Cl.stringAscii("")], ACCOUNTS[a.who]];
  if (a.kind === "handover") {
    if (a.step === 0) return [`${DEPLOYER}.nayori-roles`, "propose-handover", [Cl.uint(1), Cl.principal(STRANGER)], TREASURY];
    if (a.step === 1) return [`${DEPLOYER}.nayori-roles`, "accept-handover", [Cl.uint(1)], STRANGER];
    return [`${DEPLOYER}.nayori-roles`, "cancel-handover", [Cl.uint(1)], TREASURY];
  }
  if (count === 0) return undefined;
  const id = pickJob(a, count);
  const j = jobOf(id);
  const decision = Cl.uint(a.value % 10 === 0 ? 3 : 1 + (a.value % 2));
  const applicant = other(j, a.value);
  const table = {
    "fund-job": [ESCROW, j.client, []],
    "name-provider": [ESCROW, j.client, [Cl.principal(other(j, a.value))]],
    "accept-job": [ESCROW, j.provider, []],
    "submit-work": [ESCROW, j.provider, [Cl.bufferFromHex("ab".repeat(32))]],
    "record-decision": [ESCROW, j.evaluator, [decision, hash(a.seed)]],
    "record-default-approval": [ESCROW, undefined, []],
    appeal: [ESCROW, j.approved ? j.client : j.provider, [hash(a.seed + 1)]],
    "resolve-appeal": [ESCROW, AUTHORITY, [decision, hash(a.seed + 2)]],
    "settle-job": [ESCROW, undefined, []],
    "refund-no-delivery": [ESCROW, undefined, []],
    "close-unfunded": [ESCROW, undefined, []],
    "rate-provider": [ESCROW, j.client, [Cl.uint(a.value % 7)]],
    "apply-to-job": [APPS, applicant, [Cl.uint(100 + (a.value % 3000))]],
    withdraw: [APPS, applicant, []],
    decline: [APPS, j.client, [Cl.principal(applicant)]],
    release: [APPS, undefined, [Cl.principal(applicant)]],
  }[a.kind];
  const [contract, role, rest] = table;
  return [contract, a.kind, [Cl.uint(id), ...rest], sender(role, a.who)];
};

const check = (trace) => {
  for (const [contract, fn] of INVARIANTS) {
    const r = read(contract, fn);
    if (r.type !== ClarityType.BoolTrue) throw new Error(`${fn} returned ${cvToString(r)} after:\n${trace.slice(-40).join("\n")}`);
  }
};

let runIndex = 0;
await fc.assert(
  fc.asyncProperty(fc.array(actionArb, { minLength: 150, maxLength: 300, size: "max" }), async (actions) => {
    simnet = await initSimnet(MANIFEST);
    runIndex += 1;
    let count = 0;
    const trace = [];
    for (const a of actions) {
      if (a.kind === "mine") { simnet.mineEmptyBurnBlocks(a.blocks); trace.push(`mine ${a.blocks}`); check(trace); continue; }
      const p = plan(a, count);
      if (!p) continue;
      const [contract, fn, args, caller] = p;
      const { result } = simnet.callPublicFn(contract, fn, args, caller);
      trace.push(`${caller.slice(0, 6)} ${fn} ${args.map(cvToString).join(" ")} -> ${cvToString(result)}`);
      if (result.type === ClarityType.ResponseOk) {
        successes.set(fn, (successes.get(fn) ?? 0) + 1);
        if (fn === "create-job") count = Number(result.value.value);
      }
      check(trace);
    }
  }),
  { numRuns: RUNS, seed: SEED, endOnFailure: true },
);

console.log(`lifecycle campaign: ${runIndex} runs, seed ${SEED}, invariants held after every action`);
for (const name of [...successes.keys()].sort()) console.log(`  ${name}: ${successes.get(name)}`);
const missing = MUST_SUCCEED.filter((name) => !successes.has(name));
if (missing.length > 0) {
  console.error(`never succeeded: ${missing.join(", ")}`);
  process.exitCode = 1;
}
