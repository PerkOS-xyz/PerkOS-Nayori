import { evidenceManifest } from "../../../constants/evidence";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(evidenceManifest, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
