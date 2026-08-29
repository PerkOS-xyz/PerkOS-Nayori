import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { parseReputationSync } from "./reputation-sync";

describe("versioned reputation synchronization parser", () => {
  it("parses the nested Clarity tuple without treating every bool CV as truthy", () => {
    expect(
      parseReputationSync(
        Cl.ok(
          Cl.tuple({
            pending: Cl.bool(false),
            "last-error": Cl.uint(0),
            outcome: Cl.uint(1),
          })
        )
      )
    ).toEqual({ pending: false, lastError: 0, outcome: 1 });
  });

  it("retains a pending registry error for permissionless retry", () => {
    expect(
      parseReputationSync(
        Cl.ok(
          Cl.tuple({
            pending: Cl.bool(true),
            "last-error": Cl.uint(501),
            outcome: Cl.uint(2),
          })
        )
      )
    ).toEqual({ pending: true, lastError: 501, outcome: 2 });
  });
});
