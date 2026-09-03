import { NAYORI_FACILITATOR_ORIGIN } from "../constants/discovery";
import { NETWORK_NAME } from "../constants/network";

export type DirectPayment = {
  txid: string; protocol: "x402" | "mpp"; asset: "STX" | "sBTC" | "USDCx";
  amountAtomic: string; decimals: number; payer: string; payTo: string; feeMicroStx: string;
  blockHeight: number; confirmedAt: string; deliveryStatus: string;
};
export type DirectPaymentSnapshot = {
  schemaVersion: 1; network: string; generatedAt: string; dataStatus: "live";
  scope: "nayori-public-resources"; limit: number; hasMore: boolean; excludedCount: number;
  payments: DirectPayment[];
} | { schemaVersion: 1; network: string; dataStatus: "unavailable" };

const network = NETWORK_NAME === "mainnet" ? "stacks:1" : "stacks:2147483648";
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const atomic = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9][0-9]{0,38})$/.test(v);
const principal = (v: unknown): v is string => typeof v === "string" && /^S[PTMN][0-9A-Z]{26,62}$/.test(v);
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

export function parseDirectPayments(value: unknown): DirectPaymentSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.network !== network || value.dataStatus !== "live" ||
      value.scope !== "nayori-public-resources" || !date(value.generatedAt) || value.limit !== 25 ||
      typeof value.hasMore !== "boolean" || !Number.isInteger(value.excludedCount) ||
      (value.excludedCount as number) < 0 || (value.excludedCount as number) > 25 ||
      !Array.isArray(value.payments) || value.payments.length > 25) throw new Error("Invalid public payment source");
  const seen = new Set<string>();
  const payments: DirectPayment[] = value.payments.map((p: unknown) => {
    if (!isRecord(p) || typeof p.txid !== "string" || !/^0x[0-9a-f]{64}$/.test(p.txid) || seen.has(p.txid) ||
        !["x402", "mpp"].includes(p.protocol as string) || !["STX", "sBTC", "USDCx"].includes(p.asset as string) ||
        (p.protocol === "mpp" && p.asset !== "USDCx") || p.decimals !== (p.asset === "sBTC" ? 8 : 6) ||
        !atomic(p.amountAtomic) || !atomic(p.feeMicroStx) || !principal(p.payer) || !principal(p.payTo) ||
        !Number.isSafeInteger(p.blockHeight) || (p.blockHeight as number) < 1 || !date(p.confirmedAt) ||
        !["delivery_pending", "delivering", "delivered", "failed", "expired", "unavailable"].includes(p.deliveryStatus as string)) {
      throw new Error("Invalid public payment record");
    }
    seen.add(p.txid);
    // Explicit public-field projection: never relay arbitrary facilitator fields.
    return { txid: p.txid, protocol: p.protocol as DirectPayment["protocol"], asset: p.asset as DirectPayment["asset"],
      amountAtomic: p.amountAtomic, decimals: p.decimals as number, payer: p.payer, payTo: p.payTo,
      feeMicroStx: p.feeMicroStx, blockHeight: p.blockHeight as number, confirmedAt: p.confirmedAt,
      deliveryStatus: p.deliveryStatus as string };
  });
  return { schemaVersion: 1, network, generatedAt: value.generatedAt, dataStatus: "live",
    scope: "nayori-public-resources", limit: 25, hasMore: value.hasMore,
    excludedCount: value.excludedCount as number, payments };
}

export function formatAtomicAmount(value: string, decimals: number): string {
  if (!/^(0|[1-9][0-9]{0,79})$/.test(value) || ![6, 8].includes(decimals)) return "—";
  const padded = value.padStart(decimals + 1, "0");
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return padded.slice(0, -decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? `.${fraction}` : "");
}

export async function loadDirectPayments(request: typeof fetch = fetch): Promise<DirectPaymentSnapshot> {
  try {
    const response = await request(`${NAYORI_FACILITATOR_ORIGIN}/v1/public/payments`, {
      headers: { accept: "application/json" }, redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok || !response.body) throw new Error("Unavailable source");
    const reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64 * 1024) throw new Error("Oversized source");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return parseDirectPayments(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { return { schemaVersion: 1, network, dataStatus: "unavailable" }; }
}
