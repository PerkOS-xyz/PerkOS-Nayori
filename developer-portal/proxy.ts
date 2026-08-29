import { type NextRequest, NextResponse } from 'next/server';
import { isMarkdownPreferred } from 'fumadocs-core/negotiation';

const excludedPrefixes = ['/api/', '/llms', '/og/', '/_next/'];

function markdownTarget(pathname: string) {
  const normalized = pathname === '/' ? '' : pathname.replace(/\/$/, '');
  return `/llms.mdx${normalized}/content.md`;
}

export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === '/favicon.ico') {
    return NextResponse.redirect(new URL('/icon.svg', request.nextUrl), 308);
  }

  if (excludedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (pathname.endsWith('.md')) {
    const pagePath = pathname.slice(0, -3) || '/';
    return NextResponse.rewrite(new URL(markdownTarget(pagePath), request.nextUrl));
  }

  if (isMarkdownPreferred(request)) {
    return NextResponse.rewrite(new URL(markdownTarget(pathname), request.nextUrl), {
      headers: { Vary: 'Accept' },
    });
  }

  return NextResponse.next();
}
