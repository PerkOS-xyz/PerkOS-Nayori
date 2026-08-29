import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const schemaPath = new URL('../openapi/nayori-api.json', import.meta.url);
const manifestPath = new URL('../openapi/manifest.json', import.meta.url);
const raw = await readFile(schemaPath, 'utf8');
const schema = JSON.parse(raw);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const failures = [];
const requiredPaths = [
  '/health',
  '/supported',
  '/v1',
  '/mpp/v1',
  '/mcp',
  '/.well-known/agent.json',
  '/.well-known/oauth-authorization-server',
];

if (schema.openapi !== '3.1.0') failures.push('OpenAPI version must be 3.1.0.');
if (schema.info?.title !== 'Nayori Agent Commerce API') failures.push('Unexpected API title.');
if (schema.servers?.[0]?.url !== 'https://api.nayori.ai') failures.push('Unexpected API origin.');

for (const path of requiredPaths) {
  if (!schema.paths?.[path]) failures.push(`Missing required path: ${path}`);
}

const digest = createHash('sha256').update(raw).digest('hex');
if (digest !== manifest.sha256) failures.push('OpenAPI snapshot SHA-256 does not match manifest.');
if (manifest.apiVersion !== schema.info?.version) failures.push('API version does not match manifest.');

const forbiddenExampleKeys = /private.?key|seed.?phrase|mnemonic|client.?secret/i;
if (forbiddenExampleKeys.test(raw)) failures.push('Schema contains a forbidden secret-bearing field name.');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`OpenAPI ${schema.info.version} valid · ${Object.keys(schema.paths).length} paths · ${digest}`);
