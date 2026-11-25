import { describe, expect, it } from "vitest";
import { forgetPendingProposal, readPendingProposal, rememberPendingProposal } from "./pending-proposal";

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, v); },
  };
}

describe("pending multisig proposals", () => {
  it("remembers a proposal per job and asset, and forgets it", () => {
    const store = memory();
    expect(readPendingProposal("stx", 1, store)).toBeNull();
    rememberPendingProposal("stx", 1, "resolve-appeal", store);
    expect(readPendingProposal("stx", 1, store)?.action).toBe("resolve-appeal");
    expect(readPendingProposal("sbtc", 1, store)).toBeNull();
    expect(readPendingProposal("stx", 2, store)).toBeNull();
    forgetPendingProposal("stx", 1, store);
    expect(readPendingProposal("stx", 1, store)).toBeNull();
  });

  it("ignores malformed values and storage that throws", () => {
    const store = memory();
    store.setItem("nayori:proposal:stx:3", "{not json");
    expect(readPendingProposal("stx", 3, store)).toBeNull();
    const broken = { ...memory(), getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } as Storage;
    expect(readPendingProposal("stx", 3, broken)).toBeNull();
    expect(() => rememberPendingProposal("stx", 3, "resolve-appeal", broken)).not.toThrow();
  });
});
