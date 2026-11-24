import { describe, expect, it } from "vitest";

import { buildEvaluableDescription, buildEvaluationRequest } from "./evaluable-jobs";
import { assertSelfConsistent, isRelayableEscrow, parseRelayBody, relayEvaluation } from "./evaluation-relay";

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

  describe("Nayori contracts", () => {
    const NEXT_MAINNET = "SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X";
    const NEXT_TESTNET = "ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY";
    const nextContext = (asset: "sbtc" | "stx", network: "mainnet" | "testnet" = "mainnet") => ({
      network,
      asset,
      contract: `${network === "mainnet" ? NEXT_MAINNET : NEXT_TESTNET}.nayori-escrow-${asset}`,
      client: network === "mainnet" ? context.client : "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5",
      evaluator: network === "mainnet" ? context.evaluator : "STBTXHXFXFGMNPXST7A6XQ1WNGC0V6TB6CDDQZB4",
    });
    async function nextBody(asset: "sbtc" | "stx", network: "mainnet" | "testnet" = "mainnet") {
      const ctx = nextContext(asset, network);
      const built = await buildEvaluableDescription(ctx, "Summarize the escrow flow.", "Under 150 words");
      return buildEvaluationRequest({
        context: ctx,
        jobId: 3,
        provider: network === "mainnet" ? provider : "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG",
        description: built.description,
        reviewDeadlineBurn: 970_144,
        evidence,
      });
    }

    it("accepts self-consistent requests for both Nayori escrows on both networks", async () => {
      for (const network of ["mainnet", "testnet"] as const) {
        for (const asset of ["sbtc", "stx"] as const) {
          const body = await nextBody(asset, network);
          expect(parseRelayBody(JSON.parse(JSON.stringify(body)))).toEqual(body);
          await expect(assertSelfConsistent(body)).resolves.toBeUndefined();
        }
      }
    });

    it("forwards a Nayori escrow request unchanged", async () => {
      const body = await nextBody("sbtc");
      const sent: string[] = [];
      const transport = (async (_input: string | URL | Request, init?: RequestInit) => {
        sent.push(String(init?.body));
        return Response.json({ evaluationId: body.evaluationId, status: "queued" }, { status: 202 });
      }) as unknown as typeof fetch;
      const result = await relayEvaluation(body, { origin: "http://nayori-evaluator-production:8080", transport });
      expect(sent).toEqual([JSON.stringify(body)]);
      expect(result.status).toBe(202);
    });

    it("rejects look-alike, cross-network and wrong-asset Nayori escrows", async () => {
      const body = JSON.parse(JSON.stringify(await nextBody("sbtc")));
      for (const contract of [
        "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.nayori-escrow-sbtc",
        `${NEXT_MAINNET}.nayori-escrow-stx`,
        `${NEXT_TESTNET}.nayori-escrow-sbtc`,
        `${NEXT_MAINNET}.nayori-escrow-sbtc-v2`,
      ]) {
        expect(() => parseRelayBody({ ...body, contract })).toThrow(/malformed/);
      }
      expect(isRelayableEscrow(`${NEXT_MAINNET}.nayori-escrow-sbtc`, "mainnet", "sbtc")).toBe(true);
      expect(isRelayableEscrow(`${NEXT_MAINNET}.nayori-escrow-stx`, "mainnet", "stx")).toBe(true);
      expect(isRelayableEscrow("SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.agentic-commerce-v6", "mainnet", "stx")).toBe(true);
    });
  });
});
