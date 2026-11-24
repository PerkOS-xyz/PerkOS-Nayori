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
    expect(overview).toContain('SDK 0.10.0 · Stable npm');
    expect(overview).toContain('CLI @perkos/nayori 0.3.0 · npm');
  });

  it('documents the appeal lifecycle on the live mainnet contracts', () => {
    const guide = readFileSync(
      new URL('../content/docs/commerce/autonomous-evaluation.mdx', import.meta.url),
      'utf8',
    );
    expect(guide).toContain('nayori-escrow-sbtc');
    expect(guide).toContain('nayori-escrow-stx');
    expect(guide).toContain('SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X');
    expect(guide).toContain('This lifecycle is active on Stacks mainnet');
    expect(guide).toContain('Mainnet is fixed at 144 burn blocks');
    expect(guide).toContain('await nayori.appeal(');
    expect(guide).toContain('await nayori.resolveAppeal');
    expect(guide).toContain('await nayori.settleJob');
    expect(guide).toContain('recordDefaultApproval');
  });

  it('states the fixed 2% fee of the live contracts and keeps earlier jobs on their terms', () => {
    const guide = readFileSync(
      new URL('../content/docs/commerce/service-fees.mdx', import.meta.url),
      'utf8',
    );
    expect(guide).toContain('2% of the budget on every');
    expect(guide).toContain('`floor(B / 50)`');
    expect(guide).toContain('Jobs on the earlier contracts keep their original terms');
    expect(guide).not.toContain('serviceFeeAcceptance');
  });

  it('documents the live contracts, roles and testnet deployer in the contract reference', () => {
    const reference = readFileSync(
      new URL('../content/docs/reference/contracts.mdx', import.meta.url),
      'utf8',
    );
    for (const text of [
      'SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X',
      'ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY',
      'SMFE58EKCK5ZPD7YCYM1CQY7K3H8SEXQH7C3YT8S',
      'SM3950RVR364J25ZRFFNHB5TCNJ7VKPKKGD4N2RP9',
      'nayori-escrow-sbtc', 'nayori-escrow-stx', 'nayori-agents', 'nayori-applications',
      'nayori-reputation', 'nayori-roles', 'nayori-permissions', 'accept-job',
    ]) expect(reference).toContain(text);
  });
});
