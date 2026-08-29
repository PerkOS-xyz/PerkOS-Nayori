// Chainhook receiver. Hiro Chainhooks POST contract events here in real time.
// Available at /api/chainhook on the configured public site origin.
// For now it validates and acknowledges; wire `apply` to a store (Vercel KV / Postgres)
// to persist an on-chain activity index that powers /stats and notifications.

import { timingSafeEqual } from "node:crypto";
import { PRODUCT_NAME } from "../../../constants/brand";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_CHAINHOOK_BYTES = 65_536;

function validBearer(value: string, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const supplied = Buffer.from(value, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readPayload(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_CHAINHOOK_BYTES) {
    throw new Error("body_too_large");
  }
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_CHAINHOOK_BYTES) {
    throw new Error("body_too_large");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid_json");
  }
}

export async function POST(req: Request) {
  const secret = process.env.CHAINHOOK_SECRET?.trim();
  if (!secret) {
    return Response.json({ ok: false, error: "receiver_not_configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  if (!validBearer(auth, secret)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await readPayload(req);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "body_too_large";
    return Response.json(
      { ok: false, error: tooLarge ? "body_too_large" : "invalid_json" },
      { status: tooLarge ? 413 : 400 },
    );
  }
  const applied = Array.isArray(body?.apply) ? body.apply : [];

  // TODO: persist events (Vercel KV / DB) to index agents, jobs, and distinct wallets.
  console.log("[chainhook] received blocks:", applied.length);

  return Response.json({ ok: true, received: applied.length });
}

export async function GET() {
  return Response.json({
    status: `${PRODUCT_NAME} chainhook receiver`,
    configured: Boolean(process.env.CHAINHOOK_SECRET?.trim()),
  });
}
