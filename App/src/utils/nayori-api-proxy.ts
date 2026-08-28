import { NAYORI_API_ORIGIN } from "../constants/discovery";

const PUBLIC_PATHS = new Set([
  "/x402.json",
]);

export async function proxyNayoriApiDiscovery(path: string): Promise<Response> {
  if (!PUBLIC_PATHS.has(path)) {
    return Response.json({ error: "unsupported_discovery_path" }, { status: 404 });
  }
  const upstreamUrl = `${NAYORI_API_ORIGIN}${path}`;
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: path.endsWith(".md") ? "text/markdown" : "application/json" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return Response.json(
        { error: "discovery_temporarily_unavailable", canonical: upstreamUrl },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "Content-Location": upstreamUrl,
        "Content-Type": upstream.headers.get("content-type") ??
          (path.endsWith(".md") ? "text/markdown; charset=utf-8" : "application/json"),
      },
    });
  } catch {
    return Response.json(
      { error: "discovery_temporarily_unavailable", canonical: upstreamUrl },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
