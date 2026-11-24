// Rendezvous dialers for the next-version contracts.
// Uniform random arguments almost never hit a live job, so the pre-dialer folds
// them into useful ranges: job IDs onto created jobs (mostly the newest),
// budgets, deadlines and deposits inside their bounds (with short deadlines so
// the fuzzer crosses them), valid decisions and scores plus one invalid value,
// and 32 non-zero hash bytes. Each mapping is a pure function of the generated
// value, so a seed replays the same campaign; one call in ten keeps its raw
// arguments so out-of-range inputs are still tried.
const { createHash } = require("node:crypto");
const rv = require.resolve("@stacks/rendezvous");
const { Cl, ClarityType, cvToString } = require(require.resolve("@stacks/transactions", { paths: [rv] }));

const JOB_FIRST = new Set([
  "fund-job", "name-provider", "accept-job", "submit-work", "record-decision", "record-default-approval",
  "appeal", "resolve-appeal", "settle-job", "refund-no-delivery", "close-unfunded", "rate-provider",
  "retry-reputation", "apply-to-job", "withdraw", "decline", "release",
]);
const STX = process.env.RV_ASSET === "stx";
let jobs = 0n;

const uintOf = (cv) => (cv && cv.type === ClarityType.UInt ? BigInt(cv.value) : undefined);
const keepRaw = (n) => n % 10n === 0n;
const fold = (args, i, modulo, offset = 0n) => {
  const raw = uintOf(args[i]);
  if (raw === undefined || keepRaw(raw)) return;
  args[i] = Cl.uint((raw % modulo) + offset);
};
const hash = (args, i) => {
  if (args[i] === undefined) return;
  args[i] = Cl.bufferFromHex(createHash("sha256").update(cvToString(args[i])).digest("hex"));
};

const preSteer = ({ selectedFunction, clarityValueArguments: args }) => {
  const name = selectedFunction.name;
  if (JOB_FIRST.has(name)) {
    const raw = uintOf(args[0]);
    if (raw !== undefined && jobs > 0n && !keepRaw(raw)) {
      args[0] = Cl.uint(raw % 10n < 6n ? jobs : (raw % jobs) + 1n);
    }
  }
  switch (name) {
    case "create-job": // evaluator budget delivery review description
      fold(args, 1, STX ? 5_000_000n : 50_000n, STX ? 1_000_000n : 1_000n);
      fold(args, 2, 300n, 144n);
      fold(args, 3, 60n, 12n);
      break;
    case "record-decision":
      fold(args, 1, 3n);
      hash(args, 2);
      break;
    case "appeal":
      hash(args, 1);
      break;
    case "resolve-appeal":
      fold(args, 1, 3n);
      hash(args, 2);
      break;
    case "rate-provider":
      fold(args, 1, 7n);
      break;
    case "apply-to-job":
      fold(args, 1, 2_000n, 100n);
      break;
    default:
      break;
  }
};

const postTrack = ({ selectedFunction, functionCall }) => {
  if (selectedFunction.name !== "create-job" || !functionCall) return;
  if (functionCall.result.type !== ClarityType.ResponseOk) return;
  const id = uintOf(functionCall.result.value);
  if (id !== undefined && id > jobs) jobs = id;
};

module.exports = { preSteer, postTrack };
