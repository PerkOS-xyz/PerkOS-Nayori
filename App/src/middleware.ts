import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prefersMarkdown } from "./utils/content-negotiation";

export function middleware(request: NextRequest) {
  if (prefersMarkdown(request.headers.get("accept"))) {
    const markdownUrl = request.nextUrl.clone();
    markdownUrl.pathname = "/llms.txt";
    return NextResponse.rewrite(markdownUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
