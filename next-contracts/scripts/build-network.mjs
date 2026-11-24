// Builds the deployable sources for one network into build/<network>/.
//
// The production sources in contracts/ target mainnet and carry simnet-only
// definitions (;; #[env(simnet)]) for tests and fuzzing. This script:
//   1. removes every simnet-only definition, as Clarinet does on publish;
//   2. replaces only the per-network constants: the canonical sBTC contract
//      and the two initial role principals;
//   3. fails if anything else would differ from the source.
// It writes build/<network>/contracts/*.clar plus a Clarinet.toml so that
// `clarinet check` can verify the exact bytes that will be deployed.
//
// Usage: node scripts/build-network.mjs <testnet|mainnet> --treasury <principal> --authority <principal>
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SBTC = {
  mainnet: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
  testnet: "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token",
};
// Deployment order: every contract after the ones it calls.
export const CONTRACTS = [
  "nayori-permissions", "nayori-roles", "nayori-reputation", "nayori-escrow-sbtc",
  "nayori-escrow-stx", "nayori-agents", "nayori-applications",
];
const SOURCE_SBTC = SBTC.mainnet;
const SOURCE_TREASURY = "ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND";
const SOURCE_AUTHORITY = "ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const fail = (message) => { console.error(`build-network: ${message}`); process.exit(1); };

// Removes each top-level form preceded by a `;; #[env(simnet)]` line, together
// with that annotation, any lint annotations between it and the form, and the
// comment lines directly above the annotation.
export function stripSimnet(source) {
  const lines = source.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() !== ";; #[env(simnet)]") { out.push(lines[i]); i += 1; continue; }
    while (out.length > 0 && out[out.length - 1].trim().startsWith(";;")) out.pop();
    i += 1;
    while (i < lines.length && lines[i].trim().startsWith(";; #[")) i += 1;
    let depth = 0;
    let started = false;
    while (i < lines.length) {
      const code = lines[i].replace(/;;.*$/, "");
      for (const ch of code.replace(/"([^"\\]|\\.)*"/g, "")) {
        if (ch === "(") { depth += 1; started = true; }
        if (ch === ")") depth -= 1;
      }
      i += 1;
      if (started && depth === 0) break;
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");
}

const replaceOnce = (text, from, to, what) => {
  const count = text.split(from).length - 1;
  if (count === 0) fail(`${what}: expected value not found`);
  return text.split(from).join(to);
};

function main() {
  const network = process.argv[2];
  if (!SBTC[network]) fail("network must be testnet or mainnet");
  const treasury = arg("treasury");
  const authority = arg("authority");
  if (!treasury || !authority) fail("--treasury and --authority are required");
  if (treasury === authority) fail("treasury and appeal authority must differ");
  const prefix = network === "mainnet" ? /^S[PM]/ : /^S[TN]/;
  if (!prefix.test(treasury) || !prefix.test(authority)) fail(`role principals must be ${network} addresses`);

  const outDir = join(ROOT, "build", network);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "contracts"), { recursive: true });

  for (const name of CONTRACTS) {
    const original = readFileSync(join(ROOT, "contracts", `${name}.clar`), "utf8");
    // The invariants section at the end of a contract is simnet-only: cut it
    // whole, after checking nothing but simnet definitions and comments live there.
    const MARKER = ";; ---------------------------------------------------------------- invariants";
    let source = original;
    if (source.includes(MARKER)) {
      const [head, tail] = source.split(MARKER);
      const leftover = stripSimnet(tail).split("\n").filter((l) => l.trim() && !l.trim().startsWith(";;"));
      if (leftover.length > 0) fail(`${name}: non-simnet code in the invariants section`);
      source = `${head.replace(/\n+$/, "")}\n`;
    }
    let text = stripSimnet(source);
    if (/^\s*;; #\[env\(simnet\)\]\s*$/m.test(text)) fail(`${name}: simnet code left after stripping`);
    const before = text;
    if (text.includes(SOURCE_SBTC)) text = replaceOnce(text, SOURCE_SBTC, SBTC[network], `${name} sBTC`);
    if (name === "nayori-roles") {
      text = replaceOnce(text, SOURCE_TREASURY, treasury, "treasury");
      text = replaceOnce(text, SOURCE_AUTHORITY, authority, "appeal authority");
    }
    // Only the substituted constants may differ from the stripped source.
    const changed = before.split("\n").filter((line, i) => line !== text.split("\n")[i]);
    const allowed = changed.every((line) => line.includes(SOURCE_SBTC) || line.includes(SOURCE_TREASURY)
      || line.includes(SOURCE_AUTHORITY));
    if (!allowed) fail(`${name}: unexpected difference after substitution`);
    writeFileSync(join(outDir, "contracts", `${name}.clar`), text);
    console.log(`${network}/${name}.clar  ${text.length} bytes  (${changed.length} network line(s) set)`);
  }

  const manifest = [
    "# Generated by scripts/build-network.mjs: the exact sources to deploy.",
    "[project]", `name = "nayori-next-${network}"`, "authors = []", "telemetry = false", 'cache_dir = "./.cache"', "",
    "[[project.requirements]]", `contract_id = "${SBTC[network]}"`, "",
    ...CONTRACTS.flatMap((name) => [`[contracts.${name}]`, `path = "contracts/${name}.clar"`, "clarity_version = 6",
      'epoch = "4.0"', ""]),
  ].join("\n");
  writeFileSync(join(outDir, "Clarinet.toml"), manifest);
  mkdirSync(join(outDir, "settings"), { recursive: true });
  writeFileSync(join(outDir, "settings", "Devnet.toml"), readFileSync(join(ROOT, "settings", "Devnet.toml")));
  console.log(`built ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
