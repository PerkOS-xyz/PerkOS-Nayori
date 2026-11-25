import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NextJobActions from "./NextJobActions";
import type { NextJobDetail } from "../../services/nayori-next/reads";

const VAULT = "SM3950RVR364J25ZRFFNHB5TCNJ7VKPKKGD4N2RP9";
const MEMBER = "SP2R584GC8W2A921080TY8CQ8P1GZ6JNXYXS65DA6";

function appealedJob(): NextJobDetail {
  return {
    job: {
      id: 1,
      asset: "stx",
      client: "SP1BNFCRAAE8AJF6Q2VGWVM0W59B8RVQ4YXCW7GW3",
      evaluator: "SP3GRG5CKEFNYM5BV0NPPHCM51FT176JQ02QWQ9T3",
      provider: "SP1B1RQGJ181PDME5TJFXCGBPZHE78HXRCYS4B6DC",
      treasury: "SMFE58EKCK5ZPD7YCYM1CQY7K3H8SEXQH7C3YT8S",
      appealAuthority: VAULT,
      budget: 1_000_000,
      description: "In three sentences, explain how a Nayori job settles after an appeal.",
      deliveryDeadline: 977_669,
      deliveryBlocks: 144,
      reviewBlocks: 144,
      status: 6,
      statusName: "disputed",
    },
    submission: { deliverable: "ab".repeat(32), reviewDeadline: 977_669 },
    decision: {
      decision: "approve",
      byDefault: false,
      evidenceHash: "cd".repeat(32),
      appealDeadline: 977_669,
      appellant: "SP1BNFCRAAE8AJF6Q2VGWVM0W59B8RVQ4YXCW7GW3",
      resolutionDeadline: 977_669,
    },
    escrow: 1_000_000,
    rated: false,
    reputationPending: false,
  };
}

const render = (wallet: string, progress: Parameters<typeof NextJobActions>[0]["progress"] = null, burnHeight = 977_526) =>
  renderToStaticMarkup(
    createElement(NextJobActions, { detail: appealedJob(), wallet, burnHeight, busy: null, run: async () => {}, progress })
  );

describe("appeal resolution by a Leather multisig vault", () => {
  it("tells a member wallet and a visitor where the vault resolves the appeal", () => {
    for (const html of [render(MEMBER), render("")]) {
      expect(html).toContain("Waiting for the appeal authority");
      expect(html).toContain("Activity");
      expect(html).toContain("Broadcast");
      expect(html).toContain("leather.io/multisig");
      expect(html).toContain("977,669");
    }
  });

  it("says the original decision stands once the resolution window has ended", () => {
    const html = render(MEMBER, null, 977_700);
    expect(html).not.toContain("Waiting for the appeal authority");
    expect(html).toContain("The resolution window ended at Bitcoin block 977,669");
  });

  it("offers the resolve buttons to the vault account itself", () => {
    const html = render(VAULT);
    expect(html).toContain("Approve and pay the provider");
    expect(html).toContain("Reject and return to the client");
    expect(html).not.toContain("Waiting for the appeal authority");
  });

  it("replaces the buttons with the steps once the vault created its proposal", () => {
    const html = render(VAULT, { state: "proposed", label: "Approve and pay the provider", key: "resolve-appeal" });
    expect(html).toContain("Proposal created");
    expect(html).toContain("Broadcast");
    expect(html).not.toContain("Reject and return to the client");
  });
});
