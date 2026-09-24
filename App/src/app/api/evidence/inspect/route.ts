import { EvidenceInspectError, inspectEvidence } from "../../../../services/evidence-inspect";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let uri: unknown;
  try {
    uri = ((await request.json()) as { uri?: unknown })?.uri;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  if (typeof uri !== "string" || uri.length > 2048) {
    return Response.json({ error: "invalid_uri" }, { status: 400, headers: NO_STORE });
  }
  try {
    const signal = AbortSignal.timeout(10_000);
    return Response.json(await inspectEvidence(uri, { signal }), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof EvidenceInspectError) {
      return Response.json({ error: "evidence_rejected", message: error.message }, { status: error.status, headers: NO_STORE });
    }
    return Response.json({ error: "evidence_rejected", message: "The evidence could not be inspected." }, { status: 422, headers: NO_STORE });
  }
}
