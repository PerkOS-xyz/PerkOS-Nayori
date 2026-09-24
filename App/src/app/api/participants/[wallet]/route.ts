import { participants as pinnedParticipants } from "../../../../constants/participants";
import { getParticipantStore } from "../../../../services/participant-store";

export const dynamic = "force-dynamic";

const HEADERS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=30, stale-while-revalidate=120" };

/** One participant, by wallet: what the page and the CLI prefill before an edit. Public data. */
export async function GET(_request: Request, context: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await context.params;
  if (!/^S[PTMN][0-9A-Z]{38,40}$/.test(wallet)) {
    return Response.json({ error: "invalid_wallet" }, { status: 400, headers: HEADERS });
  }
  const pinned = pinnedParticipants.find((p) => p.wallet.address.toUpperCase() === wallet.toUpperCase());
  if (pinned) return Response.json({ ...pinned, source: "pinned" }, { headers: HEADERS });
  const store = await getParticipantStore();
  const stored = store ? await store.get(wallet) : null;
  if (!stored) return Response.json({ error: "not_listed", wallet }, { status: 404, headers: HEADERS });
  return Response.json({ ...stored, source: "registry" }, { headers: HEADERS });
}
