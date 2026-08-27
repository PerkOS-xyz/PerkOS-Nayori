import { PUBLIC_DISCOVERY_HEADERS } from "../../../../constants/agent-readiness";
import { buildAgentSkillsIndex } from "../../../../constants/agent-skills-server";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(buildAgentSkillsIndex(), {
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
