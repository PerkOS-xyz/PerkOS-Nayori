import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { siteOrigin } from '@/lib/shared';

export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({
    url: `${siteOrigin}${page.url}`,
    changeFrequency: 'weekly',
    priority: page.url === '/' ? 1 : 0.8,
  }));
}
