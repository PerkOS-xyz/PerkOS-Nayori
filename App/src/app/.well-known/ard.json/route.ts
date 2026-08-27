import {
  buildArdManifest,
  PUBLIC_DISCOVERY_HEADERS,
} from "../../../constants/agent-readiness";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(buildArdManifest(), {
    headers: PUBLIC_DISCOVERY_HEADERS,
  });
}

export async function HEAD() {
  return new Response(null, {
    headers: {
      ...PUBLIC_DISCOVERY_HEADERS,
      "Content-Type": "application/json",
    },
  });
}
