// One-time generation of a dedicated mainnet treasury signer. The private key
// is written only to a new external mode-0600 file and is never printed.
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  fsyncSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import {
  getAddressFromPrivateKey,
  randomPrivateKey,
} from "@stacks/transactions";
import { SafetyError, ensure } from "./service-fee-mainnet-core.mjs";

export function validateTarget(path) {
  ensure(isAbsolute(path || ""), "Treasury secret path must be absolute");
  ensure(
    realpathSync(dirname(path)) === dirname(path),
    "Treasury secret parent must exist and not be a symlink",
  );
  let repository;
  try {
    repository = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dirname(path),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* expected: operational secrets live outside Git */
  }
  ensure(!repository, "Treasury secret must be outside every Git repository");
  return path;
}

export function main(env = process.env) {
  ensure(env.STACKS_NETWORK === "mainnet", "STACKS_NETWORK must explicitly be mainnet");
  ensure(
    env.CONFIRM_CREATE_MAINNET_TREASURY === "create-dedicated-mainnet-treasury",
    "Missing exact mainnet treasury creation confirmation",
  );
  const path = validateTarget(env.SERVICE_FEE_MAINNET_TREASURY_ENV_PATH);
  const privateKey = randomPrivateKey();
  const address = getAddressFromPrivateKey(privateKey, "mainnet");
  const descriptor = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(
      descriptor,
      `NAYORI_MAINNET_TREASURY_ADDRESS=${address}\nNAYORI_MAINNET_TREASURY_PRIVATE_KEY=${privateKey}\n`,
    );
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const directory = openSync(dirname(path), constants.O_RDONLY);
  fsyncSync(directory);
  closeSync(directory);
  console.log(`Dedicated Nayori mainnet treasury created: ${address}`);
  console.log("Private key written once to the confirmed external mode-0600 path; it was not printed.");
  return { address, path };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof SafetyError ? error.message : "Treasury creation stopped safely.");
    process.exitCode = 1;
  }
}
