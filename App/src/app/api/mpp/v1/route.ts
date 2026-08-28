import {
  NAYORI_MPP_EXPOSE_HEADERS,
  proxyNayoriMppResource,
} from "../../../../utils/nayori-api-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyNayoriMppResource(request);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers":
        "Accept, Content-Type, Payment-Authorization, X-NAYORI-SIGNED-QUOTE, X-Request-Id",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": NAYORI_MPP_EXPOSE_HEADERS,
      "Access-Control-Max-Age": "600",
      "Cache-Control": "no-store",
    },
  });
}
