import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import proxy from './proxy';

describe('documentation proxy', () => {
  it('redirects legacy favicon discovery to the canonical SVG icon', () => {
    const response = proxy(new NextRequest('https://docs.nayori.ai/favicon.ico'));

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://docs.nayori.ai/icon.svg');
  });
});
