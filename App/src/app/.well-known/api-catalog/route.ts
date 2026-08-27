import {
  buildApiCatalog,
  PUBLIC_DISCOVERY_HEADERS,
} from "../../../constants/agent-readiness";
import { NAYORI_API_ORIGIN } from "../../../constants/discovery";

export const dynamic = "force-static";

const contentType = "application/linkset+json";
const linkHeader = [
  `<${NAYORI_API_ORIGIN}/openapi.json>; rel="service-desc"; type="application/json"`,
  `<${NAYORI_API_ORIGIN}/llms.txt>; rel="service-doc"; type="text/markdown"`,
  `<${NAYORI_API_ORIGIN}/health>; rel="status"; type="application/json"`,
].join(", ");

const headers = {
  ...PUBLIC_DISCOVERY_HEADERS,
  "Content-Type": contentType,
  Link: linkHeader,
};

export async function GET() {
  return Response.json(buildApiCatalog(), { headers });
}

export async function HEAD() {
  return new Response(null, { headers });
}
