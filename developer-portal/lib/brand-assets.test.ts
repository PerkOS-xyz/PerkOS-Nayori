import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function expectPng(path: string) {
  const file = readFileSync(resolve(process.cwd(), path));
  expect(file.subarray(1, 4).toString()).toBe('PNG');
  expect(file.byteLength).toBeGreaterThan(100_000);
}

describe('Nayori Docs brand assets', () => {
  it('publishes the approved product identity assets', () => {
    expectPng('public/brand/Logo.png');
    expectPng('public/brand/Banner.png');
    expectPng('public/brand/PerkOS.png');
  });

  it('uses the approved logo in navigation and banner on the overview', () => {
    const logo = readFileSync(resolve(process.cwd(), 'components/nayori-logo.tsx'), 'utf8');
    const overview = readFileSync(resolve(process.cwd(), 'content/docs/index.mdx'), 'utf8');

    expect(logo).toContain('/brand/Logo.png');
    expect(logo).toContain('/brand/PerkOS.png');
    expect(overview).toContain('<BrandBanner />');
  });

  it('copies public assets into the standalone VPS image', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8');

    expect(dockerfile).toContain(
      'COPY --from=builder --chown=nextjs:nodejs /app/public ./public',
    );
  });
});
