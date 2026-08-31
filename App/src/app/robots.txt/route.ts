import {
  buildRobotsText,
  PUBLIC_DISCOVERY_HEADERS,
} from "../../constants/agent-readiness";

export const dynamic = "force-static";

export async function GET() {
  const qa = process.env.NEXT_PUBLIC_RELEASE_CHANNEL === "qa";
  return new Response(qa ? "User-agent: *\nDisallow: /\n" : buildRobotsText(), {
    headers: {
      ...PUBLIC_DISCOVERY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      ...(qa ? { "X-Robots-Tag": "noindex, nofollow, noarchive" } : {}),
    },
  });
}
