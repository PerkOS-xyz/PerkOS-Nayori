import { loadParticipantDirectory } from "../../../services/participants";

export const dynamic = "force-dynamic";

/** Paginated public directory: `?page=1&pageSize=50&q=handle-or-wallet`. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50));
  const q = url.searchParams.get("q")?.slice(0, 80) || undefined;
  const directory = await loadParticipantDirectory({ page, pageSize, q });
  return Response.json(directory, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "X-Nayori-Data-Status": directory.dataStatus,
    },
  });
}
