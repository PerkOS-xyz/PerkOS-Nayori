import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildDiscoveryLinkHeader } from "./constants/agent-readiness";
import { SITE_ORIGIN } from "./constants/site";
import { prefersMarkdown } from "./utils/content-negotiation";

export function middleware(request: NextRequest) {
  const discoveryLink = buildDiscoveryLinkHeader(SITE_ORIGIN);

  if (prefersMarkdown(request.headers.get("accept"))) {
    const markdownUrl = request.nextUrl.clone();
    markdownUrl.pathname = "/llms.txt";
    const response = NextResponse.rewrite(markdownUrl);
    response.headers.set("Link", discoveryLink);
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("Link", discoveryLink);
  return response;
}

export const config = {
  matcher: "/",
};
