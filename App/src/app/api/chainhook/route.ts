// Chainhook receiver. Hiro Chainhooks POST contract events here in real time.
// Available at /api/chainhook on the configured public site origin.
// For now it validates and acknowledges; wire `apply` to a store (Vercel KV / Postgres)
// to persist an on-chain activity index that powers /stats and notifications.

import { PRODUCT_NAME } from "../../../constants/brand";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CHAINHOOK_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const applied = Array.isArray(body?.apply) ? body.apply : [];

  // TODO: persist events (Vercel KV / DB) to index agents, jobs, and distinct wallets.
  console.log("[chainhook] received blocks:", applied.length);

  return Response.json({ ok: true, received: applied.length });
}

export async function GET() {
  return Response.json({ status: `${PRODUCT_NAME} chainhook receiver ready` });
}
