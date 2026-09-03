import { loadTransparencySnapshot } from "../../../services/transparency";
import { loadDirectPayments } from "../../../services/direct-payments";

export const dynamic = "force-dynamic";

export async function GET() {
  const [snapshot, directPayments] = await Promise.all([loadTransparencySnapshot(), loadDirectPayments()]);
  return Response.json({ ...snapshot, directPayments }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "X-Nayori-Data-Status": snapshot.dataStatus.chain,
    },
  });
}
