import {
  getAgentSkill,
  PUBLIC_DISCOVERY_HEADERS,
} from "../../../../../constants/agent-readiness";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [
    { skill: "nayori-discovery" },
    { skill: "nayori-onchain-commerce" },
    { skill: "nayori-x402-quotes" },
    { skill: "nayori-mpp-usdcx" },
  ];
}

type RouteContext = {
  params: Promise<{ skill: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { skill: skillName } = await context.params;
  const skill = getAgentSkill(skillName);

  if (!skill) {
    return new Response("Skill not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(skill.content, {
    headers: {
      ...PUBLIC_DISCOVERY_HEADERS,
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}

export async function HEAD(request: Request, context: RouteContext) {
  const response = await GET(request, context);
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}
