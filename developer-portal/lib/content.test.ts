import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import schema from '../openapi/nayori-api.json';
import manifest from '../openapi/manifest.json';

describe('versioned public references', () => {
  it('pins the canonical Nayori API origin and schema version', () => {
    expect(schema.openapi).toBe('3.1.0');
    expect(schema.info.version).toBe(manifest.apiVersion);
    expect(schema.servers[0]?.url).toBe('https://api.nayori.ai');
  });

  it('keeps public milestone language out of the developer overview', () => {
    const overview = readFileSync(
      new URL('../content/docs/index.mdx', import.meta.url),
      'utf8',
    );
    expect(overview).not.toMatch(/\b(?:M1|M2|Milestone\s*[12])\b/i);
  });
});
