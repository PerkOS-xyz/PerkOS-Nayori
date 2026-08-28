import { loadTransparencySnapshot } from "../../../services/transparency";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadTransparencySnapshot();
  return Response.json(snapshot, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "X-Nayori-Data-Status": snapshot.dataStatus.chain,
    },
  });
}
