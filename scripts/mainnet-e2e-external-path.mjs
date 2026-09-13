import { lstatSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

export function canonicalExternalPath(root, input, label) {
  if (!input || !isAbsolute(input)) throw new Error(`${label} must be an absolute path`);
  const canonicalRoot = realpathSync(root);
  const raw = resolve(input);
  const rawParent = dirname(raw);
  const parentStat = lstatSync(rawParent);
  if (
    !parentStat.isDirectory() || parentStat.isSymbolicLink() ||
    parentStat.uid !== process.getuid() || (parentStat.mode & 0o077) !== 0
  ) {
    throw new Error(`${label} parent must be an operator-owned private directory, not a symlink`);
  }
  const canonicalParent = realpathSync(rawParent);
  const candidate = resolve(canonicalParent, basename(raw));
  const relation = relative(canonicalRoot, candidate);
  if (!relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`${label} must resolve outside Git`);
  }
  let insideGit = false;
  try {
    insideGit = execFileSync(
      "git",
      ["-C", canonicalParent, "rev-parse", "--is-inside-work-tree"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim() === "true";
  } catch {
    // A non-zero exit means the canonical parent is not inside a Git work tree.
  }
  if (insideGit) throw new Error(`${label} must resolve outside every Git work tree`);
  return candidate;
}
