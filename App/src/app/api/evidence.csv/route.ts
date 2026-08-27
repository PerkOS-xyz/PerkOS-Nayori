import { evidenceTransactionsCsv } from "../../../constants/evidence";

export const dynamic = "force-static";

export async function GET() {
  return new Response(evidenceTransactionsCsv(), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Disposition": 'attachment; filename="nayori-evidence-mainnet.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
