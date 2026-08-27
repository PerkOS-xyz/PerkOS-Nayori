import { proxyNayoriApiDiscovery } from "../../utils/nayori-api-proxy";

export const dynamic = "force-dynamic";
export async function GET() {
  return proxyNayoriApiDiscovery("/x402.json");
}
