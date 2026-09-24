import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { EVIDENCE_MAX_BYTES, assertAllowedEvidenceUri, evidenceOrigins, inspectEvidence } from "./evidence-inspect";

const origins = evidenceOrigins("");
const text = "The escrow locks the budget before work starts.";
const respond = (body: BodyInit | null, init: ResponseInit = {}) =>
  (async () => new Response(body, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, ...init })) as unknown as typeof fetch;

describe("evidence inspection", () => {
  it("defaults to the Evaluator's allowlist and validates configured origins", () => {
    expect(origins).toEqual(["https://nayori.ai", "https://raw.githubusercontent.com", "https://gist.githubusercontent.com"]);
    expect(evidenceOrigins("https://nayori.ai, https://example.com/")).toEqual(["https://nayori.ai", "https://example.com"]);
    expect(() => evidenceOrigins("http://nayori.ai")).toThrow();
    expect(() => evidenceOrigins("https://nayori.ai/path")).toThrow();
  });

  it("rejects non-allowlisted, non-https and credentialed URLs before fetching", () => {
    expect(() => assertAllowedEvidenceUri("https://evil.example/x", origins)).toThrow(/allowed origin/);
    expect(() => assertAllowedEvidenceUri("http://nayori.ai/x", origins)).toThrow();
    expect(() => assertAllowedEvidenceUri("https://user:pw@nayori.ai/x", origins)).toThrow();
    expect(() => assertAllowedEvidenceUri("https://nayori.ai/x#frag", origins)).toThrow();
    expect(() => assertAllowedEvidenceUri("not a url", origins)).toThrow();
  });

  it("hashes the exact bytes and reports size and media type", async () => {
    const result = await inspectEvidence("https://nayori.ai/job-evidence/brief.txt", { origins, transport: respond(text) });
    expect(result).toEqual({
      uri: "https://nayori.ai/job-evidence/brief.txt",
      sha256: createHash("sha256").update(text).digest("hex"),
      sizeBytes: Buffer.byteLength(text),
      mediaType: "text/plain",
    });
  });

  it("fails closed on wrong media type, oversized, empty, invalid UTF-8 and non-200 answers", async () => {
    await expect(inspectEvidence("https://nayori.ai/a", { origins, transport: respond("<html>", { headers: { "content-type": "text/html" } }) })).rejects.toThrow(/text\/plain/);
    await expect(inspectEvidence("https://nayori.ai/a", { origins, transport: respond("x".repeat(EVIDENCE_MAX_BYTES + 1)) })).rejects.toThrow(/between 1 and/);
    await expect(inspectEvidence("https://nayori.ai/a", { origins, transport: respond("") })).rejects.toThrow(/between 1 and/);
    await expect(inspectEvidence("https://nayori.ai/a", { origins, transport: respond(new Uint8Array([0xff, 0xfe])) })).rejects.toThrow(/UTF-8/);
    await expect(inspectEvidence("https://nayori.ai/a", { origins, transport: respond("", { status: 404 }) })).rejects.toThrow(/HTTP 404/);
    await expect(inspectEvidence("https://nayori.ai/a", { origins, transport: (async () => { throw new TypeError("redirect"); }) as unknown as typeof fetch })).rejects.toThrow(/could not be fetched/);
  });
});
