// Stateful lifecycle campaign for sbtc-commerce-v5, built on the Rendezvous
// fuzzing project (same generated contract, same Clarity invariants).
//
// `rv ... invariant` picks the caller and the function uniformly, so a job
// rarely walks the six steps from create to settlement. This campaign
// generates whole action sequences with fast-check instead: each action
// targets a created job (mostly the newest) and is sent by the account that
// holds the matching role four times in five, by a random account otherwise.
// Burn blocks are mined as an action, so review, appeal and expiry deadlines
// are crossed at random points. After every action all five `invariant-*`
// functions of the harness must return true.
//
// Usage (from rendezvous/): node lifecycle.mjs [--runs N] [--seed S]
import { initSimnet } from "@stacks/clarinet-sdk";
import { Cl, ClarityType, cvToString } from "@stacks/transactions";
import fc from "fast-check";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
};
const RUNS = arg("runs", 40);
const SEED = arg("seed", Date.now() % 2 ** 31);
const MIN_ACTIONS = 150;
const MAX_ACTIONS = 300;

const DEPLOYER = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const ESCROW = `${DEPLOYER}.sbtc-commerce-v5`;
const TOKEN = Cl.contractPrincipal(DEPLOYER, "mock-sbtc-token");
const TOKEN_ALT = Cl.contractPrincipal(DEPLOYER, "mock-sbtc-token-alt");
const APPEAL_AUTHORITY = "ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0";
const TREASURY = "ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ";
const ACCOUNTS = [
  "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5",
  "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG",
  "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC",
  APPEAL_AUTHORITY,
  TREASURY,
];
const INVARIANTS = [
  "invariant-escrow-equals-token-balance",
  "invariant-sbtc-conserved",
  "invariant-jobs-consistent",
  "invariant-roles-stable",
  "invariant-harness-capacity",
];
// Every settlement path must succeed at least once, or the campaign proved nothing.
const MUST_SUCCEED = [
  "create-job", "set-budget", "fund-job", "submit-work", "record-decision",
  "appeal-decision", "finalize-decision", "resolve-appeal", "settle-appeal-timeout",
  "settle-review-timeout", "expire-job", "waive-service-fee", "refund-service-fee",
  "rate-provider",
];

const simnet = await initSimnet("./Clarinet.toml");
const successes = new Map();

const read = (fn, args) => simnet.callReadOnlyFn(ESCROW, fn, args, DEPLOYER).result;
const principal = (cv) => (cv.type === ClarityType.OptionalSome ? cv.value.value : cv.value);

const jobRoles = (id) => {
  const result = read("get-job", [Cl.uint(id)]);
  if (result.type !== ClarityType.ResponseOk) return undefined;
  const job = result.value.value;
  const decision = read("get-decision", [Cl.uint(id)]);
  return {
    client: principal(job.client),
    provider: job.provider.type === ClarityType.OptionalSome ? principal(job.provider) : undefined,
    evaluator: principal(job.evaluator),
    authority: principal(job["appeal-authority"]),
    treasury: principal(job.treasury),
    approved:
      decision.type === ClarityType.ResponseOk &&
      decision.value.value["original-decision"].value === 1n,
  };
};

const hash = (n) => Cl.bufferFromHex(n.toString(16).padStart(8, "0").repeat(8));

// role: the account that should send the action; who < 80 keeps it.
const sender = (role, who) => (role !== undefined && who < 80 ? role : ACCOUNTS[who % ACCOUNTS.length]);

// Wallets 1-3 take the client, evaluator and provider roles in some order;
// one create in ten draws all three from every account, including the
// appeal authority and the treasury, which the escrow must refuse.
const rolesArb = fc.oneof(
  { weight: 9, arbitrary: fc.shuffledSubarray([0, 1, 2], { minLength: 3, maxLength: 3 }) },
  { weight: 1, arbitrary: fc.tuple(fc.nat(4), fc.nat(4), fc.nat(4)) },
);

const actionArb = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("create"), roles: rolesArb,
    providerKnown: fc.nat(3), expiry: fc.integer({ min: 1, max: 3000 }) }) },
  { weight: 6, arbitrary: fc.record({ kind: fc.constant("set-budget"), pick: fc.nat(99), who: fc.nat(99),
    amount: fc.oneof(fc.integer({ min: 0, max: 60 }), fc.integer({ min: 1, max: 100000 })) }) },
  { weight: 70, arbitrary: fc.record({ kind: fc.constantFrom("fund-job", "assign-provider",
    "submit-work", "record-decision", "appeal-decision", "finalize-decision", "resolve-appeal",
    "settle-appeal-timeout", "settle-review-timeout", "expire-job", "waive-service-fee",
    "refund-service-fee", "rate-provider", "retry-reputation-sync"),
    pick: fc.nat(99), who: fc.nat(99), value: fc.nat(6), alt: fc.nat(9), seed: fc.nat() }) },
  // Mostly short hops; a long jump now and then crosses the 144-block windows.
  { weight: 12, arbitrary: fc.record({ kind: fc.constant("mine"),
    blocks: fc.oneof({ weight: 4, arbitrary: fc.integer({ min: 1, max: 12 }) },
      { weight: 1, arbitrary: fc.integer({ min: 40, max: 160 }) }) }) },
);

// Statuses from sbtc-commerce-v5. Four actions in five go to a job whose
// status lets the action succeed; the fifth goes to any job.
const READY = {
  "set-budget": (j) => j.status === 0n,
  "fund-job": (j) => j.status === 0n && j.budget > 0n,
  "assign-provider": (j) => j.status === 1n,
  "submit-work": (j) => j.status === 1n && j.hasProvider,
  "record-decision": (j) => j.status === 2n,
  "settle-review-timeout": (j) => j.status === 2n,
  "appeal-decision": (j) => j.status === 7n,
  "finalize-decision": (j) => j.status === 7n,
  "resolve-appeal": (j) => j.status === 8n,
  "settle-appeal-timeout": (j) => j.status === 8n,
  "expire-job": (j) => j.status === 0n || j.status === 1n,
  "waive-service-fee": (j) => [3n, 4n, 7n, 8n].includes(j.status),
  "refund-service-fee": (j) => j.status === 3n || j.status === 4n,
  "rate-provider": (j) => j.status === 3n,
  "retry-reputation-sync": (j) => j.status === 3n || j.status === 4n,
};

const jobState = (id) => {
  const job = read("get-job", [Cl.uint(id)]).value.value;
  return {
    status: job.status.value,
    budget: job.budget.value,
    hasProvider: job.provider.type === ClarityType.OptionalSome,
  };
};

const pickJob = (action, jobs) => {
  const ready = [...jobs].filter(([, job]) => READY[action.kind](job)).map(([id]) => id);
  if (action.pick < 80 && ready.length > 0) return ready[action.pick % ready.length];
  return (action.pick % jobs.size) + 1;
};

const runAction = (action, jobs) => {
  if (action.kind === "mine") {
    simnet.mineEmptyBurnBlocks(action.blocks);
    return { name: "mine" };
  }
  if (action.kind === "create") {
    const [client, evaluator, provider] = action.roles;
    // Three creates in four name the provider up front; the rest assign it later.
    const providerArg = action.providerKnown === 0 ? Cl.none() : Cl.some(Cl.principal(ACCOUNTS[provider]));
    const args = [providerArg, Cl.principal(ACCOUNTS[evaluator]),
      Cl.uint(simnet.blockHeight + action.expiry), Cl.stringAscii("rv lifecycle job")];
    return { name: "create-job", args, caller: ACCOUNTS[client] };
  }
  if (jobs.size === 0) return undefined;
  const id = pickJob(action, jobs);
  const roles = jobRoles(id);
  const token = action.alt === 0 ? TOKEN_ALT : TOKEN;
  const decision = () => Cl.uint(action.value % 3);
  const name = action.kind;
  const plans = {
    "set-budget": () => [roles.client, [Cl.uint(action.amount)]],
    "fund-job": () => [roles.client, [token]],
    "assign-provider": () => [roles.client, [Cl.principal(ACCOUNTS[action.value % 3])]],
    "submit-work": () => [roles.provider, [Cl.bufferFromHex("ab".repeat(32))]],
    "record-decision": () => [roles.evaluator, [decision(), hash(action.seed + 1), hash(action.seed + 2)]],
    "appeal-decision": () => [roles.approved ? roles.client : roles.provider, [hash(action.seed + 3)]],
    "finalize-decision": () => [undefined, [token]],
    "resolve-appeal": () => [roles.authority, [decision(), hash(action.seed + 4), token]],
    "settle-appeal-timeout": () => [undefined, [token]],
    "settle-review-timeout": () => [undefined, [token]],
    "expire-job": () => [undefined, [token]],
    "waive-service-fee": () => [roles.authority, [hash(action.seed + 5)]],
    "refund-service-fee": () => [roles.treasury, [token]],
    "rate-provider": () => [action.value % 2 === 0 ? roles.client : roles.evaluator,
      [Cl.uint(action.value), Cl.stringAscii("rv")]],
    "retry-reputation-sync": () => [undefined, []],
  };
  const plan = plans[name]();
  const [role, rest] = plan;
  return { name, args: [Cl.uint(id), ...rest], caller: sender(role, action.who) };
};

const checkInvariants = (trace) => {
  for (const invariant of INVARIANTS) {
    const result = read(invariant, []);
    if (result.type !== ClarityType.BoolTrue) {
      throw new Error(`${invariant} returned ${cvToString(result)} after:\n${trace.join("\n")}`);
    }
  }
};

let runIndex = 0;
await fc.assert(
  fc.asyncProperty(fc.array(actionArb, { minLength: MIN_ACTIONS, maxLength: MAX_ACTIONS, size: "max" }), async (actions) => {
    await initSimnet("./Clarinet.toml");
    runIndex += 1;
    const jobs = new Map();
    const trace = [];
    for (const action of actions) {
      const call = runAction(action, jobs);
      if (call === undefined) continue;
      if (call.name === "mine") {
        trace.push(`mine ${action.blocks}`);
      } else {
        const { result } = simnet.callPublicFn(ESCROW, call.name, call.args, call.caller);
        trace.push(`${call.caller} ${call.name} ${call.args.map(cvToString).join(" ")} -> ${cvToString(result)}`);
        if (result.type === ClarityType.ResponseOk) {
          successes.set(call.name, (successes.get(call.name) ?? 0) + 1);
          const id = call.name === "create-job" ? Number(result.value.value) : Number(call.args[0].value);
          jobs.set(id, jobState(id));
        }
      }
      checkInvariants(trace);
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
