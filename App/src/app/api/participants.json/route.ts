import { buildParticipantDirectory } from "../../../services/participants";
import { loadTransparencySnapshot } from "../../../services/transparency";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadTransparencySnapshot();
  const directory = await buildParticipantDirectory(snapshot);
  return Response.json(directory, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "X-Nayori-Data-Status": snapshot.dataStatus.chain,
    },
  });
}
