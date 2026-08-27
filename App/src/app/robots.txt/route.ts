import {
  buildRobotsText,
  PUBLIC_DISCOVERY_HEADERS,
} from "../../constants/agent-readiness";

export const dynamic = "force-static";

export async function GET() {
  return new Response(buildRobotsText(), {
    headers: {
      ...PUBLIC_DISCOVERY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
