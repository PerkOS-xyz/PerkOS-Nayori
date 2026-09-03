import { loadDirectPayments } from "../../../services/direct-payments";

export const dynamic = "force-dynamic";
export async function GET() {
  const snapshot = await loadDirectPayments();
  return Response.json(snapshot, { status: snapshot.dataStatus === "live" ? 200 : 503,
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}
