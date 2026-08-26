import { buildDiscoveryManifest } from "../../../constants/discovery";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(buildDiscoveryManifest(), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
