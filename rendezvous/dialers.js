// Rendezvous dialers for sbtc-commerce-v5.
//
// Uniform random arguments almost never hit a job that exists, so the
// pre-dialer folds them into useful ranges: job IDs onto created jobs (mostly
// the newest, which is the one still moving), the token onto the default token
// most of the time (a wrong token is still tried), budgets
// onto a sats range that includes the zero-fee edge (< 50 sats), decisions and
// scores onto valid values plus one invalid value, hashes onto 32 non-zero
// bytes. Every mapping is a pure function of the generated argument, so a
// seed still replays the same campaign. About one call in ten keeps its raw
// arguments, so out-of-range inputs are still exercised.
//
// rv gives dialers no simnet handle; the harness exposes `rv-clock` and the
// post-dialer reads the chain height from it to pick reachable expiries.
const { createHash } = require("node:crypto");

const rv = require.resolve("@stacks/rendezvous");
const { Cl, ClarityType, cvToString } = require(
  require.resolve("@stacks/transactions", { paths: [rv] }),
);

const DEFAULT_TOKEN = ["ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", "mock-sbtc-token"];
const JOB_ID_FIRST = new Set([
  "set-budget", "fund-job", "assign-provider", "submit-work", "record-decision",
  "appeal-decision", "finalize-decision", "resolve-appeal", "settle-appeal-timeout",
  "settle-review-timeout", "expire-job", "retry-reputation-sync", "rate-provider",
  "waive-service-fee", "refund-service-fee",
]);
const MAX_BUDGET_SATS = 100000n;
const EXPIRY_SPREAD_BLOCKS = 3000n;

let jobsCreated = 0n;
let clockHeight = 0n;
let callsSinceClock = 0n;

const uintOf = (cv) => (cv && cv.type === ClarityType.UInt ? BigInt(cv.value) : undefined);

const keepRaw = (n) => n % 10n === 0n;

const hash32 = (cv) => {
  const seed = cv ? cvToString(cv) : "";
  return Cl.bufferFromHex(createHash("sha256").update(seed).digest("hex"));
};

const steerJobId = (args) => {
  const raw = uintOf(args[0]);
  if (raw === undefined || jobsCreated === 0n || keepRaw(raw)) return;
  const newest = raw % 10n < 6n;
  args[0] = Cl.uint(newest ? jobsCreated : (raw % jobsCreated) + 1n);
};

// Trait arguments arrive as contract principals; keep the generated one when
// it is the default token or for one call in seven.
const steerToken = (args, raw) => {
  args.forEach((cv, index) => {
    if (cv.type !== ClarityType.PrincipalContract) return;
    if (raw !== undefined && raw % 7n === 0n) return;
    args[index] = Cl.contractPrincipal(...DEFAULT_TOKEN);
  });
};

const steerUint = (args, index, modulo, offset = 0n) => {
  const raw = uintOf(args[index]);
  if (raw === undefined || keepRaw(raw)) return;
  args[index] = Cl.uint((raw % modulo) + offset);
};

const steerHash = (args, index) => {
  if (args[index] === undefined) return;
  args[index] = hash32(args[index]);
};

const preSteerArguments = ({ selectedFunction, clarityValueArguments: args }) => {
  const name = selectedFunction.name;
  if (JOB_ID_FIRST.has(name)) {
    steerToken(args, uintOf(args[0]));
    steerJobId(args);
  }
  switch (name) {
    case "create-job": {
      // (provider evaluator expired-at description)
      const raw = uintOf(args[2]);
      if (raw !== undefined && !keepRaw(raw)) {
        const height = clockHeight + callsSinceClock;
        args[2] = Cl.uint(height + 1n + (raw % EXPIRY_SPREAD_BLOCKS));
      }
      break;
    }
    case "set-budget":
      steerUint(args, 1, MAX_BUDGET_SATS + 1n);
      break;
    case "record-decision":
      steerUint(args, 1, 3n);
      steerHash(args, 2);
      steerHash(args, 3);
      break;
    case "appeal-decision":
    case "waive-service-fee":
      steerHash(args, 1);
      break;
    case "resolve-appeal":
      steerUint(args, 1, 3n);
      steerHash(args, 2);
      break;
    case "rate-provider":
      steerUint(args, 1, 7n);
      break;
    default:
      break;
  }
};

const postTrackChain = ({ selectedFunction, functionCall }) => {
  callsSinceClock += 1n;
  if (!functionCall || functionCall.result.type !== ClarityType.ResponseOk) return;
  const value = uintOf(functionCall.result.value);
  if (value === undefined) return;
  if (selectedFunction.name === "create-job" && value > jobsCreated) jobsCreated = value;
  if (selectedFunction.name === "rv-clock") {
    clockHeight = value;
    callsSinceClock = 0n;
  }
};

module.exports = { preSteerArguments, postTrackChain };
