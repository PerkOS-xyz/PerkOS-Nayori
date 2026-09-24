import {
  EvaluationRelayError,
  RELAY_MAX_BODY_BYTES,
  assertSelfConsistent,
  parseRelayBody,
  relayEvaluation,
} from "../../../services/evaluation-relay";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > RELAY_MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413, headers: NO_STORE });
  }
  try {
    const body = parseRelayBody(JSON.parse(text));
    await assertSelfConsistent(body);
    const result = await relayEvaluation(body, { signal: AbortSignal.timeout(15_000) });
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error) {
    if (error instanceof EvaluationRelayError) {
      return Response.json({ error: "evaluation_request_rejected", message: error.message }, { status: error.status, headers: NO_STORE });
    }
    return Response.json({ error: "evaluation_request_rejected", message: "The evaluation request is malformed." }, { status: 400, headers: NO_STORE });
  }
}
