import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('../content/docs/', import.meta.url);
const rootPath = root.pathname;
const requiredRoutes = [
  '/',
  '/getting-started/sdk',
  '/getting-started/http-api',
  '/agents/oauth',
  '/agents/mcp',
  '/commerce/escrow',
  '/commerce/x402',
  '/commerce/mpp',
  '/reference/api',
  '/reference/contracts',
  '/security/trust-boundaries',
  '/resources/troubleshooting',
];

async function walk(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    if ((await stat(path)).isDirectory()) files.push(...(await walk(path)));
    else if (/\.(md|mdx)$/.test(entry)) files.push(path);
  }
  return files;
}

function routeFor(file) {
  const path = relative(rootPath, file).replace(/\\/g, '/').replace(/\.mdx?$/, '');
  return path === 'index' ? '/' : `/${path.replace(/\/index$/, '')}`;
}

const files = await walk(rootPath);
const routes = new Set(files.map(routeFor));
const failures = [];

for (const route of requiredRoutes) {
  if (!routes.has(route)) failures.push(`Missing required documentation route: ${route}`);
}

for (const file of files) {
  const content = await readFile(file, 'utf8');
  if (!content.startsWith('---\n')) failures.push(`Missing frontmatter: ${relative(rootPath, file)}`);
  if (/\b(Milestone\s*[12]|M1|M2)\b/i.test(content)) {
    failures.push(`Public milestone terminology found: ${relative(rootPath, file)}`);
  }

  for (const match of content.matchAll(/(?:href=|\]\()["']?(\/[a-z0-9][^"')\s#?]*)/gi)) {
    const target = match[1];
    if (target && !routes.has(target) && !target.startsWith('/openapi.json')) {
      failures.push(`Broken internal link ${target} in ${relative(rootPath, file)}`);
    }
  }
}

if (failures.length > 0) {
  console.error([...new Set(failures)].join('\n'));
  process.exit(1);
}

console.log(`Content valid · ${files.length} pages · ${routes.size} routes`);
