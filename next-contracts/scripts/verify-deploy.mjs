// Read-only check of a deployment: each contract's on-chain source must equal
// build/<network>/contracts/<name>.clar byte for byte, deployed as Clarity 6,
// and the roles read from nayori-roles must equal the constants in the build.
//   node scripts/verify-deploy.mjs <testnet|mainnet> <deployer>
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cvToJSON, fetchCallReadOnlyFunction } from "@stacks/transactions";
import { CONTRACTS } from "./build-network.mjs";

const [network, deployer] = process.argv.slice(2);
if (!["testnet", "mainnet"].includes(network) || !deployer) {
  console.error("usage: node scripts/verify-deploy.mjs <testnet|mainnet> <deployer>"); process.exit(1);
}
const API = network === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";
const BUILD = join(dirname(fileURLToPath(import.meta.url)), "..", "build", network, "contracts");
let failed = 0;
const report = (ok, line) => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"}  ${line}`); };

for (const name of CONTRACTS) {
  const local = readFileSync(join(BUILD, `${name}.clar`), "utf8");
  const r = await fetch(`${API}/v2/contracts/source/${deployer}/${name}?proof=0`);
  if (r.status !== 200) { report(false, `${name}: not found (${r.status})`); continue; }
  const body = await r.json();
  report(body.source === local, `${name}: on-chain source ${body.source === local ? "equals" : "DIFFERS from"} the build`);
  const info = await (await fetch(`${API}/extended/v1/contract/${deployer}.${name}`)).json();
  report(Number(info.clarity_version) === 6, `${name}: Clarity ${info.clarity_version}, tx ${info.tx_id?.slice(0, 12)}`);
  await new Promise((ok) => setTimeout(ok, 400));
}
const roles = readFileSync(join(BUILD, "nayori-roles.clar"), "utf8");
const constant = (n) => roles.match(new RegExp(`define-constant ${n} '([0-9A-Z]+)\\)`))[1];
for (const [fn, n] of [["get-treasury", "INITIAL_TREASURY"], ["get-appeal-authority", "INITIAL_APPEAL_AUTHORITY"]]) {
  const v = cvToJSON(await fetchCallReadOnlyFunction({ contractAddress: deployer, contractName: "nayori-roles", functionName: fn,
    functionArgs: [], senderAddress: deployer, network, client: { baseUrl: API } })).value;
  report(v === constant(n), `${fn} = ${v}`);
}
console.log(failed ? `${failed} check(s) failed` : "deployment matches the build");
process.exit(failed ? 1 : 0);
