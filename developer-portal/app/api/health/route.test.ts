import { afterEach, describe, expect, it } from 'vitest';
import { dynamic, GET } from './route';

const originalRelease = process.env.NAYORI_DOCS_RELEASE;

afterEach(() => {
  if (originalRelease === undefined) delete process.env.NAYORI_DOCS_RELEASE;
  else process.env.NAYORI_DOCS_RELEASE = originalRelease;
});

describe('documentation health endpoint', () => {
  it('reports the runtime release without caching it into the build', async () => {
    process.env.NAYORI_DOCS_RELEASE = 'runtime-release-sha';

    const response = GET();

    expect(dynamic).toBe('force-dynamic');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      service: 'nayori-docs',
      status: 'ok',
      version: 'runtime-release-sha',
    });
  });
});
