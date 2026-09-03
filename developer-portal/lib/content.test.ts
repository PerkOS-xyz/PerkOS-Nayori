import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import schema from '../openapi/nayori-api.json';
import manifest from '../openapi/manifest.json';
import { appName } from './shared';

describe('versioned public references', () => {
  it('uses the institutional Nayori product name', () => {
    const overview = readFileSync(
      new URL('../content/docs/index.mdx', import.meta.url),
      'utf8',
    );

    expect(appName).toBe('Nayori — PerkOS Stacks Agentic Commerce');
    expect(overview).toContain('Nayori — PerkOS Stacks Agentic Commerce');
    expect(overview).toContain('the Bitcoin Commerce Agent');
  });

  it('pins the canonical Nayori API origin and schema version', () => {
    expect(schema.openapi).toBe('3.1.0');
    expect(schema.info.version).toBe('0.7.3');
    expect(schema.info.version).toBe(manifest.apiVersion);
    expect(schema.servers[0]?.url).toBe('https://api.nayori.ai');
    expect(
      schema.paths['/mpp/v1']?.get['x-payment-info'].offers[0]?.currency,
    ).toBe('SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx::usdcx-token');
  });

  it('keeps public milestone language out of the developer overview', () => {
    const overview = readFileSync(
      new URL('../content/docs/index.mdx', import.meta.url),
      'utf8',
    );
    expect(overview).not.toMatch(/\b(?:M1|M2|Milestone\s*[12])\b/i);
    expect(overview).toContain('SDK 0.7.1 · Public');
  });

  it('documents the autonomous appeal lifecycle as the active mainnet generation', () => {
    const guide = readFileSync(
      new URL('../content/docs/commerce/autonomous-evaluation.mdx', import.meta.url),
      'utf8',
    );
    expect(guide).toContain('agentic-commerce-v5');
    expect(guide).toContain('sbtc-commerce-v4');
    expect(guide).toContain('This lifecycle is active on Stacks mainnet');
    expect(guide).toContain('Mainnet is fixed at 144 burn blocks.');
    expect(guide).toContain('await nayori.appealDecision');
    expect(guide).toContain('await nayori.resolveAppeal');
    expect(guide).toContain('await nayori.settleAppealTimeout');
  });
});
