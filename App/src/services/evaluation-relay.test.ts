import { describe, expect, it } from "vitest";

import { buildEvaluableDescription, buildEvaluationRequest } from "./evaluable-jobs";
import { assertSelfConsistent, parseRelayBody, relayEvaluation } from "./evaluation-relay";

const context = {
  network: "mainnet" as const,
  asset: "sbtc" as const,
  contract: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.sbtc-commerce-v5",
  client: "SP10Y6Z8SVWPDFBYCJC23R9J8DGSJZFQJRWZRMAZR",
  evaluator: "SP3GRG5CKEFNYM5BV0NPPHCM51FT176JQ02QWQ9T3",
};
const provider = "SPYCCC4V6FGKHGCAVR86Q7FJ08TJG5XD1WS8J9DP";
const evidence = [{ id: "deliverable", uri: "https://nayori.ai/job-evidence/x.txt", sha256: "ab".repeat(32), mediaType: "text/plain", sizeBytes: 120 }];

async function validBody() {
  const built = await buildEvaluableDescription(context, "Summarize the escrow flow.", "Under 150 words");
  return buildEvaluationRequest({ context, jobId: 4, provider, description: built.description, reviewDeadlineBurn: 970000, evidence });
}

describe("evaluation relay", () => {
  it("accepts a self-consistent body and rejects tampered ones", async () => {
    const body = await validBody();
    expect(parseRelayBody(JSON.parse(JSON.stringify(body)))).toEqual(body);
    await expect(assertSelfConsistent(body)).resolves.toBeUndefined();
    await expect(assertSelfConsistent({ ...body, evaluationId: "00000000-0000-5000-a000-000000000000" })).rejects.toThrow(/does not match/);
    await expect(assertSelfConsistent({ ...body, acceptanceCriteria: [{ id: "c1", requirement: "Other", verification: "Other" }] })).rejects.toThrow(/does not match/);
    await expect(assertSelfConsistent({ ...body, job: { ...body.job, description: "plain" } })).rejects.toThrow(/readable acceptance criteria/);
  });

  it("rejects malformed structures without echoing them", () => {
    const body = JSON.parse(JSON.stringify(validBody()));
    for (const bad of [null, {}, { ...body, commitmentVersion: "2" }, { ...body, network: "devnet" }, { ...body, jobId: "0" }]) {
      expect(() => parseRelayBody(bad)).toThrow(/malformed/);
    }
  });

  it("answers 503 with the exact request when no Evaluator origin is configured", async () => {
    const body = await validBody();
    const result = await relayEvaluation(body, { origin: "" });
    expect(result).toMatchObject({ status: 503, relayed: false, body: { error: "evaluator_relay_unavailable", request: body } });
  });

  it("forwards the body unchanged to the configured origin and returns the upstream answer", async () => {
    const body = await validBody();
    const calls: { url: string; body: string; method?: string; redirect?: string }[] = [];
    const transport = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body), method: init?.method, redirect: init?.redirect });
      return Response.json({ evaluationId: body.evaluationId, status: "queued" }, { status: 202 });
    }) as unknown as typeof fetch;
    const result = await relayEvaluation(body, { origin: "http://nayori-evaluator-production:8080", transport });
    expect(calls).toEqual([{ url: "http://nayori-evaluator-production:8080/v1/evaluations", body: JSON.stringify(body), method: "POST", redirect: "error" }]);
    expect(result).toEqual({ status: 202, relayed: true, body: { evaluationId: body.evaluationId, status: "queued" } });
  });

  it("maps an unreachable Evaluator to 502", async () => {
    const body = await validBody();
    await expect(relayEvaluation(body, { origin: "http://127.0.0.1:9", transport: (async () => { throw new Error("down"); }) as unknown as typeof fetch })).rejects.toMatchObject({ status: 502 });
  });
});
