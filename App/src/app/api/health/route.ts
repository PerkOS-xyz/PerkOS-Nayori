import { PRODUCT_NAME } from "../../../constants/brand";

export const dynamic = "force-dynamic";

export async function GET() {
  const network =
    process.env.NEXT_PUBLIC_STACKS_NETWORK === "testnet" ? "testnet" : "mainnet";

  return Response.json(
    {
      status: "ok",
      service: `${PRODUCT_NAME.toLowerCase()}-web`,
      network,
      release: process.env.NAYORI_RELEASE_SHA || "development",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
