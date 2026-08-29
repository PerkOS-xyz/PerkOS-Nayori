'use strict';

const MAX_ENTRIES = 128;
const cache = new Map();

module.exports = class MemoryCacheHandler {
  static maxEntries = MAX_ENTRIES;

  async get(key) {
    const entry = cache.get(key);
    if (!entry) return null;

    cache.delete(key);
    cache.set(key, entry);
    return entry;
  }

  async set(key, data, context = {}) {
    if (data === null) {
      cache.delete(key);
      return;
    }

    cache.delete(key);
    cache.set(key, {
      value: data,
      lastModified: Date.now(),
      tags: context.tags ?? [],
    });

    while (cache.size > MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }
  }

  async revalidateTag(tags) {
    const invalidatedTags = new Set([tags].flat());

    for (const [key, entry] of cache.entries()) {
      if (entry.tags.some((tag) => invalidatedTags.has(tag))) cache.delete(key);
    }
  }

  resetRequestCache() {}
};
