import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const MemoryCacheHandler = require('./cache-handler.cjs');

describe('read-only runtime cache handler', () => {
  it('stores entries in memory and invalidates them by tag', async () => {
    const handler = new MemoryCacheHandler();
    await handler.set('tagged-entry', { kind: 'PAGE' }, { tags: ['docs'] });

    expect(await handler.get('tagged-entry')).toMatchObject({
      value: { kind: 'PAGE' },
      tags: ['docs'],
    });

    await handler.revalidateTag('docs');
    expect(await handler.get('tagged-entry')).toBeNull();
  });

  it('bounds memory and deletes null entries', async () => {
    const handler = new MemoryCacheHandler();
    const keys = Array.from(
      { length: MemoryCacheHandler.maxEntries + 1 },
      (_, index) => `capacity-${index}`,
    );

    for (const key of keys) {
      await handler.set(key, { kind: 'PAGE' }, { tags: ['capacity-test'] });
    }

    expect(await handler.get(keys[0])).toBeNull();
    expect(await handler.get(keys.at(-1))).not.toBeNull();

    await handler.set(keys.at(-1), null);
    expect(await handler.get(keys.at(-1))).toBeNull();
    await handler.revalidateTag('capacity-test');
  });
});
