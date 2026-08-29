import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const source = process.env.NAYORI_OPENAPI_URL ?? 'https://api.nayori.ai/openapi.json';
const sourceUrl = new URL(source);
if (sourceUrl.protocol !== 'https:') throw new Error('NAYORI_OPENAPI_URL must use HTTPS.');

const response = await fetch(sourceUrl, { headers: { Accept: 'application/json' } });
if (!response.ok) throw new Error(`OpenAPI fetch failed with HTTP ${response.status}.`);

const schema = await response.json();
if (schema.openapi !== '3.1.0' || schema.info?.title !== 'Nayori Agent Commerce API') {
  throw new Error('Fetched document is not the expected Nayori OpenAPI 3.1 schema.');
}

const normalized = `${JSON.stringify(schema, null, 2)}\n`;
const digest = createHash('sha256').update(normalized).digest('hex');
const schemaPath = new URL('../openapi/nayori-api.json', import.meta.url);
const current = await readFile(schemaPath, 'utf8');

if (process.argv.includes('--check')) {
  if (current !== normalized) {
    console.error('The versioned OpenAPI snapshot differs from the authoritative public schema.');
    process.exit(1);
  }
  console.log(`OpenAPI snapshot is current · ${digest}`);
  process.exit(0);
}

await writeFile(schemaPath, normalized);
const manifest = {
  source: sourceUrl.toString(),
  apiVersion: schema.info.version,
  openapiVersion: schema.openapi,
  lastVerified: new Date().toISOString().slice(0, 10),
  sha256: digest,
};
await writeFile(new URL('../openapi/manifest.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Updated OpenAPI snapshot · ${digest}`);
