import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildFeeEvidence, type FeeEvidenceSelection } from "./fee-evidence";
import type { CommerceJob } from "./commerce";
import ServiceFeeEvidence from "../components/ServiceFeeEvidence";

const treasury = "ST1E7E64H8VSSSGE0RPWF90RRC91MQG7CRQRM1BFX";
const selection: FeeEvidenceSelection = { stx: { contract: "STDEPLOYER.agentic-commerce-v6", enabled: true },
  sbtc: { contract: "STDEPLOYER.sbtc-commerce-v5", enabled: true } };
const zero = BigInt(0), gross = BigInt(1000), feeAmount = BigInt(20);
function job(id = 1, currency: "stx" | "sbtc" = "stx"): CommerceJob {
  return { id, currency, client: "client", provider: "provider", evaluator: "evaluator", treasury,
    budget: 1000, status: 3, expiredAt: 1, description: "Internal fixture",
    serviceFee: { treasury, gross, potentialFee: feeAmount, serviceRecorded: true,
      settlement: { gross, recipient: "provider", net: BigInt(980), chargedFee: feeAmount, refundedFee: zero } } };
}
const asset = (jobs: CommerceJob[]) => buildFeeEvidence(jobs, selection).assets[0];

describe("observed service fee accounting", () => {
  it("keeps assets with equal job IDs independent and uses JSON-safe atomic strings", () => {
    const result = buildFeeEvidence([job(), job(1, "sbtc")], selection);
    expect(result.classification).toBe("observed-accounting-not-external-revenue");
    for (const item of result.assets) expect(item.totals).toEqual({ quoted: "20", charged: "20", refunded: "0", retained: "20", refundDue: "0" });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
  it.each([0, 1, 2, 5, 6, 7, 8])("does not collect a quoted amount without settlement in state %s", status => {
    const j = job(); j.status = status; delete j.serviceFee!.settlement;
    j.serviceFee!.serviceRecorded = [7, 8].includes(status);
    expect(asset([j]).totals).toMatchObject({ quoted: "20", charged: "0", retained: "0", refunded: "0" });
  });
  it("distinguishes waiver before settlement from a refund", () => {
    const j = job(); j.serviceFee!.waiver = "11".repeat(32);
    j.serviceFee!.settlement!.chargedFee = zero; j.serviceFee!.settlement!.net = gross;
    expect(asset([j]).totals).toMatchObject({ quoted: "20", charged: "0", refunded: "0", refundDue: "0" });
  });
  it.each([3, 4])("distinguishes an outstanding waiver and actual refund for status %s", status => {
    const j = job(); j.status = status; j.serviceFee!.waiver = "11".repeat(32);
    j.serviceFee!.settlement!.recipient = status === 3 ? "provider" : "client";
    expect(asset([j]).totals).toMatchObject({ charged: "20", refunded: "0", retained: "20", refundDue: "20" });
    j.serviceFee!.settlement!.refundedFee = feeAmount;
    expect(asset([j]).totals).toMatchObject({ charged: "20", refunded: "20", retained: "0", refundDue: "0" });
  });
  it("sums beyond safe Number precision without rounding", () => {
    const jobs = Array.from({ length: 60 }, (_, i) => {
      const j = job(i + 1); j.budget = Number.MAX_SAFE_INTEGER;
      const g = BigInt(j.budget), f = g / BigInt(50);
      j.serviceFee = { treasury, gross: g, potentialFee: f, serviceRecorded: true,
        settlement: { gross: g, recipient: "provider", net: g - f, chargedFee: f, refundedFee: zero } };
      return j;
    });
    expect(asset(jobs).totals?.charged).toBe(((BigInt(Number.MAX_SAFE_INTEGER) / BigInt(50)) * BigInt(60)).toString());
  });
  it("groups distinct pinned treasuries without assuming the current wallet balance", () => {
    const first = job(), second = job(2); second.treasury = "another-treasury"; second.serviceFee!.treasury = second.treasury;
    const result = asset([first, second]);
    expect(result.treasuries).toHaveLength(2); expect(result.totals?.charged).toBe("40");
  });
  it.each([
    (j: CommerceJob) => { j.serviceFeeUnavailable = true; },
    (j: CommerceJob) => { j.status = 9; },
    (j: CommerceJob) => { delete j.serviceFee; },
    (j: CommerceJob) => { j.budget = Number.MAX_SAFE_INTEGER + 1; },
    (j: CommerceJob) => { j.serviceFee!.potentialFee = BigInt(21); },
    (j: CommerceJob) => { j.serviceFee!.gross = BigInt(999); },
    (j: CommerceJob) => { j.serviceFee!.treasury = "other"; },
    (j: CommerceJob) => { j.serviceFee!.serviceRecorded = false; },
    (j: CommerceJob) => { j.serviceFee!.waiver = "00".repeat(32); },
    (j: CommerceJob) => { delete j.serviceFee!.settlement; },
    (j: CommerceJob) => { j.serviceFee!.settlement!.refundedFee = BigInt(21); },
    (j: CommerceJob) => { j.serviceFee!.settlement!.refundedFee = BigInt(20); },
    (j: CommerceJob) => { j.serviceFee!.settlement!.net = BigInt(979); },
    (j: CommerceJob) => { j.serviceFee!.settlement!.recipient = "other"; },
    (j: CommerceJob) => { j.serviceFee!.settlement!.chargedFee = BigInt(-1); },
  ])("marks an entire affected asset unavailable on malformed/incomplete reads %#", change => {
    const bad = job(2); change(bad);
    const result = buildFeeEvidence([job(), bad, job(1, "sbtc")], selection);
    expect(result.assets[0]).toMatchObject({ status: "unavailable", totals: null, jobs: [], treasuries: [] });
    expect(result.assets[1].status).toBe("live");
  });
  it("rejects duplicates rather than doubling totals", () => {
    expect(asset([job(), job()]).status).toBe("unavailable");
  });
  it("separates an empty verified contract from unavailable chain state", () => {
    expect(asset([])).toMatchObject({ status: "live", jobsRead: 0, totals: { charged: "0" } });
    expect(buildFeeEvidence([], selection, false).assets[0]).toMatchObject({ status: "unavailable", totals: null });
  });
  it("does not advertise fees for an unsupported generation", () => {
    const result = buildFeeEvidence([job()], { stx: { contract: "STDEPLOYER.agentic-commerce-v5", enabled: false }, sbtc: selection.sbtc });
    expect(result.assets[0]).toMatchObject({ status: "not-supported", totals: null, jobs: [] });
  });
  it("renders charges/refunds, context and per-job links without implying external revenue", () => {
    const html = renderToStaticMarkup(createElement(ServiceFeeEvidence, { evidence: buildFeeEvidence([job()], selection) }));
    expect(html).toContain("Actually charged"); expect(html).toContain("Waived refund outstanding");
    expect(html).toContain("not lifetime totals"); expect(html).toContain("Internal QA activity");
    expect(html).toContain("/jobs/1?currency=stx"); expect(html).toContain(treasury);
  });
  it("renders unavailable and disabled without false zero totals", () => {
    const disabled = { stx: { ...selection.stx, enabled: false }, sbtc: selection.sbtc };
    const html = renderToStaticMarkup(createElement(ServiceFeeEvidence, { evidence: buildFeeEvidence([], disabled, false) }));
    expect(html).toContain("not enabled"); expect(html).toContain("not reported as zero"); expect(html).not.toContain("Actually charged");
  });
});
