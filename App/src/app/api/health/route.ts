import { PRODUCT_NAME } from "../../../constants/brand";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: `${PRODUCT_NAME.toLowerCase()}-web`,
      network: "mainnet",
      release: process.env.NAYORI_RELEASE_SHA || "development",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
