import { proxyNayoriApiDiscovery } from "../../../utils/nayori-api-proxy";

export const dynamic = "force-dynamic";
export async function GET() {
  return proxyNayoriApiDiscovery("/.well-known/oauth-protected-resource");
}
