/**
 * Self-service participant registry: a developer registers each wallet they operate by signing
 * the participant attestation with that wallet, from the web page or the CLI. The signature is
 * verified here, once, before the entry is stored; editing is the same wallet signing again with
 * a newer date. No accounts, no passwords: the wallet is the identity.
 */
import {
  type Participant,
  type ParticipantKind,
  type ParticipantRole,
  participants as pinnedParticipants,
} from "../constants/participants";
import { parseAttestationMessage, verifyParticipantAttestation } from "./participant-attestation";
import { type ParticipantStore, type StoredParticipant, NETWORK, getParticipantStore } from "./participant-store";

export const PARTICIPANT_MAX_BODY_BYTES = 8_192;
export const PARTICIPANT_KINDS: readonly ParticipantKind[] = ["independent-developer", "ecosystem-team", "community-member"];
export const PARTICIPANT_ROLES: readonly ParticipantRole[] = ["agent-owner", "client", "provider"];
export const HANDLE_PATTERN = /^[A-Za-z0-9._-]{2,40}$/;
const PRINCIPAL_PATTERN = /^S[PTMN][0-9A-Z]{38,40}$/;

export class ParticipantRegistryError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const optionalText = (value: unknown, max: number, what: string): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new ParticipantRegistryError(`${what} must be text of at most ${max} characters.`, 400);
  }
  return value.trim();
};
const optionalUrl = (value: unknown, what: string, hosts?: string[]): string | undefined => {
  const text = optionalText(value, 200, what);
  if (!text) return undefined;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ParticipantRegistryError(`${what} must be a full https URL.`, 400);
  }
  if (url.protocol !== "https:" || (hosts && !hosts.includes(url.hostname))) {
    throw new ParticipantRegistryError(`${what} must be an https URL${hosts ? ` on ${hosts.join(" or ")}` : ""}.`, 400);
  }
  return url.toString();
};

/** Structural validation of a submitted entry. The signature is checked separately. */
export function parseParticipantSubmission(raw: unknown): Participant {
  const fail = (message: string) => new ParticipantRegistryError(message, 400);
  if (!isRecord(raw)) throw fail("The submission must be a JSON object.");
  if (typeof raw.handle !== "string" || !HANDLE_PATTERN.test(raw.handle)) {
    throw fail("handle: 2 to 40 characters, letters, digits, dot, dash or underscore.");
  }
  const kind = (raw.kind ?? "independent-developer") as ParticipantKind;
  if (!PARTICIPANT_KINDS.includes(kind)) throw fail(`kind: one of ${PARTICIPANT_KINDS.join(", ")}.`);
  if (!isRecord(raw.wallet) || typeof raw.wallet.address !== "string" || !PRINCIPAL_PATTERN.test(raw.wallet.address)) {
    throw fail("wallet.address must be a Stacks address.");
  }
  const roles = Array.isArray(raw.wallet.roles) ? raw.wallet.roles : [];
  if (roles.length === 0 || roles.length > PARTICIPANT_ROLES.length || roles.some((role) => !PARTICIPANT_ROLES.includes(role as ParticipantRole)) || new Set(roles).size !== roles.length) {
    throw fail(`wallet.roles: a non-empty subset of ${PARTICIPANT_ROLES.join(", ")}.`);
  }
  const linksRaw = raw.links === undefined ? {} : raw.links;
  if (!isRecord(linksRaw) || Object.keys(linksRaw).some((k) => !["github", "x", "website"].includes(k))) {
    throw fail("links: an object with github, x and/or website.");
  }
  const links = {
    github: optionalUrl(linksRaw.github, "links.github", ["github.com"]),
    x: optionalUrl(linksRaw.x, "links.x", ["x.com", "twitter.com"]),
    website: optionalUrl(linksRaw.website, "links.website"),
  };
  const cleanLinks = Object.fromEntries(Object.entries(links).filter(([, v]) => v)) as Participant["links"];
  const agentIdsRaw = raw.agentIds === undefined ? [] : raw.agentIds;
  if (!Array.isArray(agentIdsRaw) || agentIdsRaw.length > 50 || agentIdsRaw.some((id) => !Number.isSafeInteger(id) || (id as number) < 1)) {
    throw fail("agentIds: up to 50 positive integers.");
  }
  const attestation = raw.attestation;
  if (!isRecord(attestation) || typeof attestation.message !== "string" || attestation.message.length > 600 ||
    typeof attestation.signature !== "string" || !/^[0-9a-f]{130}$/i.test(attestation.signature) ||
    typeof attestation.publicKey !== "string" || !/^0[23][0-9a-f]{64}$/i.test(attestation.publicKey) ||
    typeof attestation.signedAt !== "string" || Number.isNaN(Date.parse(attestation.signedAt))) {
    throw fail("attestation: message, RSV signature, compressed public key and signedAt are required.");
  }
  const organization = optionalText(raw.organization, 80, "organization");
  const notes = optionalText(raw.notes, 200, "notes");
  return {
    handle: raw.handle,
    kind,
    ...(organization ? { organization } : {}),
    ...(cleanLinks && Object.keys(cleanLinks).length > 0 ? { links: cleanLinks } : {}),
    wallet: { address: raw.wallet.address, roles: [...new Set(roles as ParticipantRole[])] },
    agentIds: [...new Set(agentIdsRaw as number[])].sort((a, b) => a - b),
    attestation: {
      message: attestation.message,
      signature: attestation.signature.toLowerCase(),
      publicKey: attestation.publicKey.toLowerCase(),
      signedAt: new Date(attestation.signedAt).toISOString(),
    },
    ...(notes ? { notes } : {}),
  };
}

export interface RegistrationResult {
  created: boolean;
  participant: StoredParticipant;
}

/**
 * Verifies the attestation and writes the entry. A wallet that is already listed can only be
 * replaced by an attestation whose date is the same or later (edit = sign again), and pinned
 * team-curated entries cannot be overwritten from the API.
 */
export async function registerParticipant(
  store: ParticipantStore,
  submission: Participant,
  network: "mainnet" | "testnet" = NETWORK,
  now = new Date(),
): Promise<RegistrationResult> {
  const verification = await verifyParticipantAttestation(submission, network);
  if (!verification.valid) throw new ParticipantRegistryError(verification.reasons.join(" "), 401);
  const fields = parseAttestationMessage(submission.attestation.message)!;
  const signedDate = Date.parse(`${fields.date}T00:00:00Z`);
  if (signedDate > now.getTime() + 36 * 3_600_000) throw new ParticipantRegistryError("The attestation date is in the future.", 400);
  if (signedDate < now.getTime() - 30 * 86_400_000) throw new ParticipantRegistryError("The attestation is older than 30 days; sign it again.", 400);
  if (pinnedParticipants.some((p) => p.wallet.address.toUpperCase() === submission.wallet.address.toUpperCase())) {
    throw new ParticipantRegistryError("This wallet is listed by the team; ask for changes through the repository.", 409);
  }
  const existing = await store.get(submission.wallet.address);
  if (existing) {
    const previous = parseAttestationMessage(existing.attestation.message)?.date ?? "";
    if (fields.date < previous) throw new ParticipantRegistryError(`A newer attestation (${previous}) is already listed; sign again with today's date.`, 409);
  }
  return store.upsert(submission, now.toISOString(), now.toISOString());
}

/** Wallets to classify `external-attested` in the public evidence: pinned entries plus the registry. */
export async function loadAttestedWallets(): Promise<Set<string>> {
  const set = new Set(pinnedParticipants.map((p) => p.wallet.address.toUpperCase()));
  try {
    const store = await getParticipantStore();
    if (store) for (const wallet of await store.wallets()) set.add(wallet);
  } catch (error) {
    console.error("Participant registry unavailable for classification:", error);
  }
  return set;
}

/** Small fixed-window limiter for the registration endpoint (one process, one container). */
const windows = new Map<string, { until: number; count: number }>();
export function allowRegistration(ip: string, now = Date.now(), limit = 10, windowMs = 60_000): boolean {
  if (windows.size > 10_000) for (const [k, w] of windows) if (w.until < now) windows.delete(k);
  const w = windows.get(ip);
  if (!w || w.until < now) {
    windows.set(ip, { until: now + windowMs, count: 1 });
    return true;
  }
  w.count += 1;
  return w.count <= limit;
}
