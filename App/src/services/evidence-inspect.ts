/**
 * Server-side evidence inspection for committed submissions.
 *
 * The provider pastes a public HTTPS URL; the app fetches the exact bytes once, under the same
 * limits the Evaluator enforces (allowlisted origin, no redirects, text/plain or application/json,
 * at most 8192 bytes, valid UTF-8) and returns the SHA-256, size and media type that go into the
 * evidence commitment. Running this on the server avoids browser CORS limits and guarantees the
 * hash is computed over the bytes the Evaluator will download.
 */
import { createHash } from "node:crypto";

export const EVIDENCE_MAX_BYTES = 8192;
export const DEFAULT_EVIDENCE_ORIGINS = [
  "https://nayori.ai",
  "https://raw.githubusercontent.com",
  "https://gist.githubusercontent.com",
];
const MEDIA_TYPES = new Set(["text/plain", "application/json"]);

export interface InspectedEvidence {
  uri: string;
  sha256: string;
  sizeBytes: number;
  mediaType: string;
}

export class EvidenceInspectError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function evidenceOrigins(env: string | undefined = process.env.NAYORI_EVIDENCE_ORIGINS): string[] {
  const configured = (env ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = configured.length > 0 ? configured : DEFAULT_EVIDENCE_ORIGINS;
  return origins.map((origin) => {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username) {
      throw new Error(`Invalid evidence origin: ${origin}`);
    }
    return url.origin;
  });
}

export function assertAllowedEvidenceUri(uri: string, origins: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new EvidenceInspectError("Enter a valid https:// URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new EvidenceInspectError("Evidence URLs must be plain https:// links without credentials or fragments.");
  }
  if (!origins.includes(url.origin)) {
    throw new EvidenceInspectError(
      `Evidence must be hosted on an allowed origin: ${origins.join(", ")}.`,
    );
  }
  return url;
}

export async function inspectEvidence(
  uri: string,
  options: { origins?: readonly string[]; transport?: typeof fetch; signal?: AbortSignal } = {},
): Promise<InspectedEvidence> {
  const origins = options.origins ?? evidenceOrigins();
  const url = assertAllowedEvidenceUri(uri, origins);
  const transport = options.transport ?? fetch;
  let response: Response;
  try {
    response = await transport(url, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      headers: { Accept: "text/plain, application/json" },
      signal: options.signal,
    });
  } catch {
    throw new EvidenceInspectError("The evidence URL could not be fetched (redirects are not followed).", 422);
  }
  if (!response.ok) {
    throw new EvidenceInspectError(`The evidence URL answered HTTP ${response.status}.`, 422);
  }
  const mediaType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!MEDIA_TYPES.has(mediaType)) {
    throw new EvidenceInspectError("Evidence must be served as text/plain or application/json.", 422);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > EVIDENCE_MAX_BYTES) {
    throw new EvidenceInspectError(`Evidence must be between 1 and ${EVIDENCE_MAX_BYTES} bytes.`, 422);
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new EvidenceInspectError("Evidence must be valid UTF-8 text.", 422);
  }
  return {
    uri: url.toString(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
    mediaType,
  };
}
