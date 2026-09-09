import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(
  new URL(`../content/docs/${name}`, import.meta.url), 'utf8',
);

describe('existing-agent onboarding', () => {
  it('publishes separate navigable role manuals with explicit non-self-service boundaries', () => {
    const pages = JSON.parse(read('getting-started/meta.json')).pages;
    for (const role of ['hermes-buyer', 'hermes-provider']) {
      expect(pages).toContain(role);
      const guide = read(`getting-started/${role}.mdx`);
      for (const text of ['0.8.0-rc.2', 'CLEAN_INSTALL.md', 'own LLM', 'x402', 'outside GitHub'])
        expect(guide).toContain(text);
      expect(guide).not.toMatch(/\/Users\/|\/opt\/|PRIVATE_KEY\s*=/);
    }
    expect(read('getting-started/hermes-provider.mdx')).toContain('no upload tool');
    expect(read('getting-started/hermes-buyer.mdx')).toContain('each job requires its own bounded authorization');
    expect(read('getting-started/existing-agent.mdx')).toContain('workflow0/settlement6');
  });
  it('links the completed npmrc.2 economics without claiming new registration', () => {
    const guide = read('resources/qa-validation.mdx');
    for (const text of ['npm0.8.0-rc.2', 'job16', '14640', 'existing registered identities', 'Fresh registration',
      '0x5b4b36234631c8430c3b7540cd1495e6b7a0e9157f2dfd79fa9e58602b0ba6d5'])
      expect(guide).toContain(text);
    expect(guide).not.toContain('A new funded npm-only run remains pending');
  });
  it('distinguishes deployed QA timing from signer and production releases', () => {
    const guide = read('commerce/workflow-timing.mdx');
    for (const text of ['deployed in QA', '0233183efb3e32d09ca0f5bf6c1ac2188921c88d',
      'Production promotion is separate', '0.8.0-rc.2', 'Version 1 remains unchanged',
      'not wallet enforcement', 'terminal jobs have no active countdown',
      'No new funded E2E or external adoption']) {
      expect(guide).toContain(text);
    }
    expect(guide).toContain('published SDK 0.8.0-rc.2');
    expect(guide).toContain('npm install --save-exact @perkos/agent-sdk@0.8.0-rc.2');
    expect(guide).toContain('Stable `latest` remains 0.7.1');
    expect(guide).not.toContain('source candidate, not yet deployed');
    expect(guide).not.toContain('After the Web candidate is deployed');
  });
  it('links verified internal QA evidence without promoting the npm or production boundary', () => {
    const page = read('resources/qa-validation.mdx');
    for (const text of ['fc0537477fda819fa9cce8e74e543be0d49ea3a4', '14240',
      'completed=true', 'published QA prerelease 0.8.0-rc.1', 'operator-supervised',
      'existing registered identities', 'unknown, not zero', 'does not buy paid resources',
      '0x382e05645560acbd822f573cab6e32579ad1d8ad3d1598916f132b28b86cce4c']) {
      expect(page).toContain(text);
    }
    expect(JSON.parse(read('resources/meta.json')).pages).toContain('qa-validation');
    expect(read('getting-started/existing-agent.mdx')).toContain('/resources/qa-validation');
    expect(read('resources/limitations.mdx')).toContain('/resources/qa-validation');
    expect(page).not.toMatch(/\/Users\/|\/opt\/|PRIVATE_KEY\s*=|\bM[12]\b/);
  });
  it('explains bounded admission, capacity and reconciliation without claiming a deployed fix', () => {
    const guide = read('getting-started/existing-agent.mdx');
    for (const text of ['45 seconds', '15 seconds', 'SDK 0.8.0-rc.2',
      'admission_limit', 'ineligible', 'nayori_evaluation_status', 'No automatic retry',
      'does not extend the contract deadline', 'separately authorized recovery']) {
      expect(guide).toContain(text);
    }
  });
  it('explains the funded QA checkpoints without skipping custody finality', () => {
    const guide = read('getting-started/existing-agent.mdx');
    for (const text of ['Wallet funding is not escrow funding', '30000 micro-STX',
      '10000 micro-STX', 'currentBurn >= transactionBurn + 6', 'not six Stacks blocks',
      'nayori_custody_status', 'job-pinned treasury', 'HERMES_CHECKPOINTS.md']) {
      expect(guide).toContain(text);
    }
  });
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
    expect(guide).toContain('published QA prerelease');
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
    expect(read('agents/mcp.mdx')).toContain('not the local QA Hermes stdio bridge');
  });

  it('does not advertise consumer npm scripts that installing the package cannot add', () => {
    expect(read('index.mdx')).not.toContain('npm run quickstart');
    expect(read('index.mdx')).toContain('node --input-type=module');
  });
});
