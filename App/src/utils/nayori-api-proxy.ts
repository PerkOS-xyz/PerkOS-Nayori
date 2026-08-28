import { NAYORI_API_ORIGIN } from "../constants/discovery";

const PUBLIC_PATHS = new Set([
  "/openapi.json",
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

const MPP_REQUEST_HEADERS = [
  "accept",
  "payment-authorization",
  "x-nayori-signed-quote",
  "x-request-id",
] as const;

const MPP_RESPONSE_HEADERS = [
  "content-type",
  "location",
  "payment-receipt",
  "retry-after",
  "www-authenticate",
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

export const NAYORI_MPP_EXPOSE_HEADERS = [
  "WWW-Authenticate",
  "Payment-Receipt",
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

async function proxyNayoriPaidResourceWithProfile(
  request: Request,
  profile: {
    readonly upstreamPath: string;
    readonly requestHeaders: readonly string[];
    readonly responseHeaders: readonly string[];
    readonly exposeHeaders: string;
    readonly errorCode: string;
  },
): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = `${NAYORI_API_ORIGIN}${profile.upstreamPath}${incomingUrl.search}`;
  const headers = new Headers();
  for (const name of profile.requestHeaders) {
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
      "Access-Control-Expose-Headers": profile.exposeHeaders,
      "Cache-Control": "no-store",
    });
    for (const name of profile.responseHeaders) {
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
          code: profile.errorCode,
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

export function proxyNayoriPaidResource(request: Request): Promise<Response> {
  return proxyNayoriPaidResourceWithProfile(request, {
    upstreamPath: "/v1",
    requestHeaders: PAYMENT_REQUEST_HEADERS,
    responseHeaders: PAYMENT_RESPONSE_HEADERS,
    exposeHeaders: NAYORI_PAYMENT_EXPOSE_HEADERS,
    errorCode: "paid_resource_temporarily_unavailable",
  });
}

export function proxyNayoriMppResource(request: Request): Promise<Response> {
  return proxyNayoriPaidResourceWithProfile(request, {
    upstreamPath: "/mpp/v1",
    requestHeaders: MPP_REQUEST_HEADERS,
    responseHeaders: MPP_RESPONSE_HEADERS,
    exposeHeaders: NAYORI_MPP_EXPOSE_HEADERS,
    errorCode: "mpp_resource_temporarily_unavailable",
  });
}
