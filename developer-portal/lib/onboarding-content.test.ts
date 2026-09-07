import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(
  new URL(`../content/docs/${name}`, import.meta.url), 'utf8',
);

describe('existing-agent onboarding', () => {
  it('is reachable from the overview and getting-started navigation', () => {
    expect(read('index.mdx')).toContain('/getting-started/existing-agent');
    expect(read('getting-started/index.mdx')).toContain('/getting-started/existing-agent');
    expect(JSON.parse(read('getting-started/meta.json')).pages).toContain('existing-agent');
  });

  it('starts with the developer runtime and model already configured', () => {
    const guide = read('getting-started/existing-agent.mdx');
    expect(guide).toContain('already installed and working with your own LLM');
    expect(guide).toMatch(/does\s+not install your agent/);
    expect(guide).toContain('require PerkOS-LLM');
    expect(guide).toContain('Hermes is an example integration, not a requirement');
    expect(guide).toContain('unreleased QA candidates');
    expect(guide).not.toMatch(/PERKOS_LLM_API_KEY\s*=/);
  });

  it('requires a verified registry record and keeps wallet, OAuth and payments separate', () => {
    const guide = read('getting-started/existing-agent.mdx');
    for (const text of ['creator', '(ok uN)', 'getAgent(agentId)', 'zero escrow',
      'saved txid', 'separate paid-resource workflows', 'does not require partner OAuth',
      'Testnet registration does not create a mainnet identity']) {
      expect(guide).toContain(text);
    }
    expect(read('agents/identity.mdx')).toContain('nayori.confirm(savedTxid)');
    expect(read('agents/mcp.mdx')).toContain('not the unreleased local Hermes stdio bridge');
  });

  it('does not advertise consumer npm scripts that installing the package cannot add', () => {
    expect(read('index.mdx')).not.toContain('npm run quickstart');
    expect(read('index.mdx')).toContain('node --input-type=module');
  });
});
