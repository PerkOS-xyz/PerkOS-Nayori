import { describe, expect, it } from 'vitest';
import { isCredentialFreeReadOperation, isEconomicOperation } from './openapi-policy';

describe('OpenAPI documentation safety policy', () => {
  it('allows credential-free discovery reads', () => {
    expect(isCredentialFreeReadOperation('/health', 'get', {})).toBe(true);
    expect(isCredentialFreeReadOperation('/supported', 'GET', {})).toBe(true);
  });

  it('never classifies paid resources as safe playground reads', () => {
    expect(isCredentialFreeReadOperation('/v1', 'get', {})).toBe(false);
    expect(isCredentialFreeReadOperation('/mpp/v1', 'get', {})).toBe(false);
    expect(isEconomicOperation('/v1/quotes')).toBe(true);
  });

  it('rejects writes and OAuth-protected operations', () => {
    expect(isCredentialFreeReadOperation('/mcp', 'post', {})).toBe(false);
    expect(
      isCredentialFreeReadOperation('/data', 'get', {
        security: [{ oauthBearer: ['mcp:invoke'] }],
      }),
    ).toBe(false);
  });
});
