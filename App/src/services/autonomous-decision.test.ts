import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { parseAutonomousDecision } from "./autonomous-decision";

describe("parseAutonomousDecision", () => {
  it("parses pending and disputed provenance without inventing optional fields", () => {
    const pending = parseAutonomousDecision(
      Cl.ok(
        Cl.tuple({
          "original-decision": Cl.uint(1),
          "final-decision": Cl.none(),
          "evidence-hash": Cl.bufferFromHex("11".repeat(32)),
          "explanation-hash": Cl.bufferFromHex("22".repeat(32)),
          "decided-at-burn": Cl.uint(100),
          "appeal-deadline": Cl.uint(103),
          "appealed-by": Cl.none(),
          "appeal-evidence-hash": Cl.none(),
          "resolution-deadline": Cl.none(),
          "resolution-hash": Cl.none(),
          "finalized-by": Cl.none(),
          "finalized-at-burn": Cl.none(),
        })
      )
    );
    expect(pending).toMatchObject({
      originalDecision: 1,
      evidenceHash: "11".repeat(32),
      explanationHash: "22".repeat(32),
      appealDeadline: 103,
    });
    expect(pending).not.toHaveProperty("resolutionDeadline");

    const disputed = parseAutonomousDecision(
      Cl.ok(
        Cl.tuple({
          "original-decision": Cl.uint(2),
          "final-decision": Cl.none(),
          "evidence-hash": Cl.bufferFromHex("11".repeat(32)),
          "explanation-hash": Cl.bufferFromHex("22".repeat(32)),
          "decided-at-burn": Cl.uint(100),
          "appeal-deadline": Cl.uint(103),
          "appealed-by": Cl.some(Cl.principal("ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5")),
          "appeal-evidence-hash": Cl.some(Cl.bufferFromHex("33".repeat(32))),
          "resolution-deadline": Cl.some(Cl.uint(106)),
          "resolution-hash": Cl.none(),
          "finalized-by": Cl.none(),
          "finalized-at-burn": Cl.none(),
        })
      )
    );
    expect(disputed).toMatchObject({
      originalDecision: 2,
      appealedBy: "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5",
      appealEvidenceHash: "33".repeat(32),
      resolutionDeadline: 106,
    });
  });
});
