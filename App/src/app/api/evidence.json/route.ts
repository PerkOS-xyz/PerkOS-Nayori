import { loadTransparencySnapshot } from "../../../services/transparency";
import { loadDirectPayments } from "../../../services/direct-payments";
import { loadAttestedWallets } from "../../../services/participant-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const attestedWallets = await loadAttestedWallets();
  const [snapshot, directPayments] = await Promise.all([loadTransparencySnapshot({ attestedWallets }), loadDirectPayments()]);
  return Response.json({ ...snapshot, directPayments }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "X-Nayori-Data-Status": snapshot.dataStatus.chain,
    },
  });
}
