import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const appRoot = process.cwd();
const nextRoot = resolve(appRoot, ".next");
const manifestPath = resolve(nextRoot, "app-build-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const routeFiles = manifest.pages?.["/page"];

if (!Array.isArray(routeFiles) || routeFiles.length === 0) {
  throw new Error("The Next.js app manifest does not contain the /page route.");
}

const budgetKiB = Number(process.env.NAYORI_HOME_FIRST_LOAD_BUDGET_KIB || "170");
if (!Number.isFinite(budgetKiB) || budgetKiB <= 0) {
  throw new Error("NAYORI_HOME_FIRST_LOAD_BUDGET_KIB must be a positive number.");
}

const uniqueFiles = [...new Set(routeFiles)];
const gzipBytes = uniqueFiles.reduce((total, relativePath) => {
  if (!relativePath.startsWith("static/chunks/")) {
    throw new Error(`Unexpected /page bundle path: ${relativePath}`);
  }
  return total + gzipSync(readFileSync(resolve(nextRoot, relativePath))).byteLength;
}, 0);

const assetBudgets = [
  ["public/brand/Banner-Web.webp", 100],
  ["public/brand/Banner-Web-loop.webm", 700],
  ["public/brand/Banner-Web-loop.mp4", 700],
];

for (const [relativePath, maxKiB] of assetBudgets) {
  const sizeKiB = statSync(resolve(appRoot, relativePath)).size / 1024;
  if (sizeKiB > maxKiB) {
    throw new Error(`${relativePath} is ${sizeKiB.toFixed(1)} KiB; budget is ${maxKiB} KiB.`);
  }
}

const actualKiB = gzipBytes / 1024;
console.log(`Nayori / First Load JS: ${actualKiB.toFixed(1)} KiB gzip (budget ${budgetKiB} KiB).`);

if (actualKiB > budgetKiB) {
  throw new Error(
    `Nayori / exceeds its First Load JS budget by ${(actualKiB - budgetKiB).toFixed(1)} KiB.`,
  );
}
