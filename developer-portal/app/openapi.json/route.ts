import schema from '@/openapi/nayori-api.json';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(schema, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
