import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import proxy from './proxy';

describe('documentation proxy', () => {
  it('redirects legacy favicon discovery to the canonical SVG icon', () => {
    const response = proxy(new NextRequest('https://docs.nayori.ai/favicon.ico'));

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://docs.nayori.ai/icon.svg');
  });

  it('serves the AI-assistant test guide as a static file instead of a page rendering', () => {
    const response = proxy(new NextRequest('https://docs.nayori.ai/nayori-test-guide.md'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('renders a documentation page as Markdown when its .md twin is requested', () => {
    const response = proxy(new NextRequest('https://docs.nayori.ai/getting-started/cli.md'));

    expect(response.headers.get('x-middleware-rewrite')).toBe('https://docs.nayori.ai/llms.mdx/getting-started/cli/content.md');
  });
});
