import { describe, expect, it } from "vitest";
import { LEATHER_MULTISIG_URL, MULTISIG_STEPS, proposalNotice, walletOutcome } from "./multisig";

const AUTHORITY = "SM3950RVR364J25ZRFFNHB5TCNJ7VKPKKGD4N2RP9";
const TEST_MULTISIG = "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1";
const SINGLE = "SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X";

describe("multisig wallet answers", () => {
  it("treats a multisig answer without a broadcast id as a pending proposal", () => {
    expect(walletOutcome(AUTHORITY, {})).toEqual({ kind: "proposal" });
    expect(walletOutcome(AUTHORITY, undefined)).toEqual({ kind: "proposal" });
    expect(walletOutcome(TEST_MULTISIG, null)).toEqual({ kind: "proposal" });
  });

  it("follows a multisig answer that carries an id, still as a proposal", () => {
    expect(walletOutcome(AUTHORITY, { txid: "0xabc" })).toEqual({ kind: "proposal", txid: "0xabc" });
    expect(walletOutcome(AUTHORITY.toLowerCase(), { txId: "abc" })).toEqual({ kind: "proposal", txid: "abc" });
  });

  it("keeps single-signature wallets on the broadcast path", () => {
    expect(walletOutcome(SINGLE, { txid: "abc" })).toEqual({ kind: "broadcast", txid: "abc" });
    expect(walletOutcome(SINGLE, {})).toEqual({ kind: "missing" });
  });

  it("says plainly that every member approves in Activity and one member broadcasts", () => {
    expect(LEATHER_MULTISIG_URL).toBe("https://leather.io/multisig");
    const text = proposalNotice("Resolve the appeal", { block: 970_288, height: 970_200 });
    expect(text).toMatch(/is now a proposal in Leather multisig/);
    expect(text).toMatch(/Activity/);
    expect(text).toMatch(/approves it/);
    expect(text).toMatch(/presses Broadcast/);
    expect(text).toMatch(/reaches the chain only then/);
    expect(text).toMatch(/before Bitcoin block 970,288/);
    expect(proposalNotice("Resolve the appeal")).not.toMatch(/before Bitcoin block/);
    expect(MULTISIG_STEPS).toHaveLength(2);
  });
});
