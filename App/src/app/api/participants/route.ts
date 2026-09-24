import {
  PARTICIPANT_MAX_BODY_BYTES,
  ParticipantRegistryError,
  allowRegistration,
  parseParticipantSubmission,
  registerParticipant,
} from "../../../services/participant-registry";
import { getParticipantStore } from "../../../services/participant-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

function publicOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "app.nayori.ai";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** Register or update a participant: the body is the wallet-signed entry the page or the CLI produced. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRegistration(ip)) {
    return Response.json({ error: "rate_limited", message: "Too many registrations from this address; try again in a minute." }, { status: 429, headers: NO_STORE });
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > PARTICIPANT_MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413, headers: NO_STORE });
  }
  let submission;
  try {
    submission = parseParticipantSubmission(JSON.parse(text));
  } catch (error) {
    const message = error instanceof ParticipantRegistryError ? error.message : "The submission is not valid JSON.";
    return Response.json({ error: "invalid_submission", message }, { status: 400, headers: NO_STORE });
  }
  const store = await getParticipantStore();
  if (!store) {
    return Response.json(
      { error: "registry_not_configured", message: "This deployment does not store registrations yet. Send the entry below to the Nayori team.", participant: submission },
      { status: 503, headers: NO_STORE },
    );
  }
  try {
    const result = await registerParticipant(store, submission);
    const wallet = result.participant.wallet.address;
    return Response.json(
      { ok: true, created: result.created, wallet, path: `/participants#${wallet}`, url: `${publicOrigin(request)}/participants#${wallet}`, participant: result.participant },
      { status: result.created ? 201 : 200, headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof ParticipantRegistryError) {
      return Response.json({ error: "registration_rejected", message: error.message }, { status: error.status, headers: NO_STORE });
    }
    console.error("Participant registration failed:", error);
    return Response.json({ error: "registry_unavailable", message: "The registry could not store the entry; try again shortly." }, { status: 503, headers: NO_STORE });
  }
}
