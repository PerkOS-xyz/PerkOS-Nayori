import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { siteOrigin } from '@/lib/shared';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = source.getPages().map((page) => ({
    url: `${siteOrigin}${page.url}`,
    changeFrequency: 'weekly',
    priority: page.url === '/' ? 1 : 0.8,
  }));
  return [
    ...pages,
    { url: `${siteOrigin}/nayori-test-guide.md`, changeFrequency: 'weekly', priority: 0.8 },
  ];
}
