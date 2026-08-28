import { NAYORI_OAUTH_ORIGIN } from "../../../constants/oauth-discovery";

export const dynamic = "force-dynamic";
export async function GET() {
  return new Response(null, {
    status: 308,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
      Location: `${NAYORI_OAUTH_ORIGIN}/.well-known/oauth-authorization-server`,
    },
  });
}

export async function HEAD() { return GET(); }
