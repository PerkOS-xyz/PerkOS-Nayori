import { buildAuthMarkdown } from "../../constants/oauth-discovery";
import { PUBLIC_DISCOVERY_HEADERS } from "../../constants/agent-readiness";

export const dynamic = "force-static";
export async function GET() {
  return new Response(buildAuthMarkdown(), {
    headers: {
      ...PUBLIC_DISCOVERY_HEADERS,
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}

export async function HEAD() {
  return new Response(null, {
    headers: {
      ...PUBLIC_DISCOVERY_HEADERS,
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
