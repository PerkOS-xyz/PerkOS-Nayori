import { describe, expect, it } from 'vitest';
import { STACKS_ORANGE } from './mermaid';

describe('Nayori diagram theme', () => {
  it('uses the canonical Stacks orange', () => {
    expect(STACKS_ORANGE).toBe('#FC6432');
  });
});
