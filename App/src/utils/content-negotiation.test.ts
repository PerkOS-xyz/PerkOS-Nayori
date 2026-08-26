import { describe, expect, it } from "vitest";
import { prefersMarkdown } from "./content-negotiation";

describe("Markdown content negotiation", () => {
  it("recognizes Markdown among weighted response formats", () => {
    expect(
      prefersMarkdown("text/html;q=0.8, text/markdown; q=1.0")
    ).toBe(true);
  });

  it("keeps normal browser requests on HTML", () => {
    expect(prefersMarkdown("text/html,application/xhtml+xml")).toBe(false);
    expect(prefersMarkdown(null)).toBe(false);
  });
});
