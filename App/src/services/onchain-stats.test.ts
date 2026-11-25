import { afterEach, describe, expect, it, vi } from "vitest";

import { INDEXED_CONTRACTS, getOnchainStats, getRecentActivity, nayoriAgentCandidatesFrom } from "./onchain-stats";

const WALLET_A = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const WALLET_B = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";

const byName = (name: string) => INDEXED_CONTRACTS.find((c) => c.name === name)!;

function call(txId: string, contractId: string, fn: string, sender: string, time: string, status = "success") {
  return {
    tx_id: txId,
    tx_type: "contract_call",
    tx_status: status,
    sender_address: sender,
    fee_rate: "1000",
    block_time_iso: time,
    block_height: 10,
    contract_call: { contract_id: contractId, function_name: fn },
  };
}

function mockHiro(histories: Record<string, any[]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const id = decodeURIComponent(String(url).split("/address/")[1].split("/transactions")[0]);
      const results = histories[id] ?? [];
      return new Response(JSON.stringify({ total: results.length, results }), { status: 200 });
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("onchain stats across both contract sets", () => {
  it("indexes the Nayori contracts first, then the earlier ones", () => {
    const sets = INDEXED_CONTRACTS.map((c) => c.set);
    expect(sets.slice(0, 7)).toEqual(["nayori", "nayori", "nayori", "nayori", "nayori", "nayori", "nayori"]);
    expect(sets.slice(7).every((set) => set === "earlier")).toBe(true);
    expect(INDEXED_CONTRACTS.map((c) => c.name)).toEqual(
      expect.arrayContaining(["nayori-escrow-sbtc", "nayori-escrow-stx", "nayori-agents", "nayori-applications", "nayori-reputation", "nayori-permissions", "nayori-roles", "agent-registry"])
    );
  });

  it("counts a call shared by two contracts once and files it under the called contract", async () => {
    const escrow = byName("nayori-escrow-stx").id;
    const reputation = byName("nayori-reputation").id;
    const agents = byName("nayori-agents").id;
    const registry = byName("agent-registry").id;
    const rate = call("0x01", escrow, "rate-provider", WALLET_A, "2026-11-24T10:00:00Z");
    mockHiro({
      [escrow]: [rate],
      [reputation]: [rate],
      [agents]: [
        call("0x02", agents, "update", WALLET_B, "2026-11-24T09:00:00Z"),
        call("0x03", agents, "register", WALLET_B, "2026-11-24T08:00:00Z"),
        call("0x04", agents, "register", WALLET_A, "2026-11-24T07:00:00Z", "abort_by_response"),
      ],
      [registry]: [call("0x05", registry, "register-agent", WALLET_A, "2026-11-23T07:00:00Z")],
    });

    const stats = await getOnchainStats({ strict: true, recentLimit: 10 });
    expect(stats.totalTx).toBe(5);
    expect(stats.contractCalls).toBe(5);
    expect(stats.successfulContractCalls).toBe(4);
    expect(stats.distinctWallets).toBe(2);
    expect(stats.recent.map((tx) => tx.txId)).toEqual(["0x01", "0x02", "0x03", "0x04", "0x05"]);
    expect(stats.recent[0]).toMatchObject({ contract: "nayori-escrow-stx", contractId: escrow, set: "nayori" });
    expect(stats.recent[4]).toMatchObject({ contract: "agent-registry", set: "earlier" });
    expect(stats.nayoriAgentCandidates).toEqual([WALLET_B]);
    expect(stats.perContract.find((c) => c.id === reputation)).toMatchObject({ set: "nayori", total: 1 });

    const activity = await getRecentActivity(10);
    expect(activity.map((tx) => tx.txId)).toEqual(["0x01", "0x02", "0x03", "0x04", "0x05"]);
  });

  it("keeps the newest successful sender of nayori-agents once", () => {
    expect(
      nayoriAgentCandidatesFrom([
        { tx_status: "success", sender_address: WALLET_A },
        { tx_status: "success", sender_address: WALLET_A.toLowerCase() },
        { tx_status: "abort_by_post_condition", sender_address: WALLET_B },
      ])
    ).toEqual([WALLET_A]);
  });
});
