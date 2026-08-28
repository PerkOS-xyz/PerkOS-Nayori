import { NAYORI_API_ORIGIN } from "../constants/discovery";

const PUBLIC_PATHS = new Set([
  "/x402.json",
]);

const PAYMENT_REQUEST_HEADERS = [
  "accept",
  "payment-signature",
  "x-nayori-signed-quote",
  "x-request-id",
] as const;

const PAYMENT_RESPONSE_HEADERS = [
  "content-type",
  "location",
  "payment-required",
  "payment-response",
  "retry-after",
  "x-nayori-settlement-id",
  "x-request-id",
  "x-service-release",
] as const;

export const NAYORI_PAYMENT_EXPOSE_HEADERS = [
  "PAYMENT-REQUIRED",
  "PAYMENT-RESPONSE",
  "X-NAYORI-SETTLEMENT-ID",
  "Location",
  "Retry-After",
  "X-Request-Id",
  "X-Service-Release",
].join(", ");

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

export async function proxyNayoriPaidResource(request: Request): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = `${NAYORI_API_ORIGIN}/v1${incomingUrl.search}`;
  const headers = new Headers();
  for (const name of PAYMENT_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "manual",
    });
    const responseHeaders = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": NAYORI_PAYMENT_EXPOSE_HEADERS,
      "Cache-Control": "no-store",
    });
    for (const name of PAYMENT_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      {
        error: {
          code: "paid_resource_temporarily_unavailable",
          message: "The Nayori paid resource is temporarily unavailable.",
        },
      },
      {
        status: 503,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
