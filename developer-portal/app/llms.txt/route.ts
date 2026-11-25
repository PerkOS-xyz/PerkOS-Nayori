import { source } from '@/lib/source';
import { llms } from 'fumadocs-core/source';
import { siteOrigin } from '@/lib/shared';

export const revalidate = false;

// Static files in public/ are not pages, so the index lists them with absolute URLs.
const files = [
  `- [Nayori test guide for AI assistants](${siteOrigin}/nayori-test-guide.md): one self-contained file to run a real job on the live contracts with the CLI.`,
];

export function GET() {
  return new Response(`${llms(source).index()}\n\n## Files\n\n${files.join('\n')}\n`);
}
