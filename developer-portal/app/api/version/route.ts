export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    {
      service: 'nayori-docs',
      version: process.env.NAYORI_DOCS_RELEASE ?? 'development',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
