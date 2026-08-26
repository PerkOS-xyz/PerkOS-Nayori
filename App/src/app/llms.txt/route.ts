import { buildLlmsText } from "../../constants/discovery";

export const dynamic = "force-static";

export async function GET() {
  return new Response(buildLlmsText(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
