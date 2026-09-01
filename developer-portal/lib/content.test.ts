import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import schema from '../openapi/nayori-api.json';
import manifest from '../openapi/manifest.json';

describe('versioned public references', () => {
  it('pins the canonical Nayori API origin and schema version', () => {
    expect(schema.openapi).toBe('3.1.0');
    expect(schema.info.version).toBe('0.7.2');
    expect(schema.info.version).toBe(manifest.apiVersion);
    expect(schema.servers[0]?.url).toBe('https://api.nayori.ai');
    expect(
      schema.paths['/mpp/v1']?.get['x-payment-info'].offers[0]?.currency,
    ).toBe('ST2WK9SGBJ15RHZ33KK0KYVSXBEBHM1XDM8C96EC4.usdcx::usdcx-token');
  });

  it('keeps public milestone language out of the developer overview', () => {
    const overview = readFileSync(
      new URL('../content/docs/index.mdx', import.meta.url),
      'utf8',
    );
    expect(overview).not.toMatch(/\b(?:M1|M2|Milestone\s*[12])\b/i);
    expect(overview).toContain('SDK 0.6.0 · Public');
  });

  it('documents the autonomous appeal lifecycle as an isolated testnet candidate', () => {
    const guide = readFileSync(
      new URL('../content/docs/commerce/autonomous-evaluation.mdx', import.meta.url),
      'utf8',
    );
    expect(guide).toContain('agentic-commerce-v5');
    expect(guide).toContain('sbtc-commerce-v4');
    expect(guide).toContain('It is not the active mainnet contract generation.');
    expect(guide).toContain('await nayori.appealDecision');
    expect(guide).toContain('await nayori.resolveAppeal');
    expect(guide).toContain('await nayori.settleAppealTimeout');
  });
});
