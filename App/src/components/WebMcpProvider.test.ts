import { describe, expect, it } from "vitest";
import {
  nayoriWebMcpTools,
} from "./WebMcpProvider";
import {
  nayoriWebMcpToolSpecs,
  webMcpBootstrapScript,
} from "../constants/webmcp";

describe("Nayori WebMCP tools", () => {
  it("exposes only explicit read-only tools", () => {
    expect(nayoriWebMcpTools.map((tool) => tool.name)).toEqual([
      "nayori_get_capabilities",
      "nayori_list_agent_skills",
      "nayori_get_public_evidence",
    ]);

    for (const tool of nayoriWebMcpTools) {
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        untrustedContentHint: false,
      });
      expect(tool.description).toContain("read-only");
    }
  });

  it("registers the same public tools before hydration", () => {
    const script = webMcpBootstrapScript();

    for (const spec of nayoriWebMcpToolSpecs) {
      expect(script).toContain(spec.name);
      expect(spec.path).toMatch(/^\//);
    }

    expect(script).toContain("document.modelContext");
    expect(script).toContain("navigator.modelContext");
    expect(script).toContain("registerTool");
    expect(script).toContain("provideContext");
    expect(script).toContain("try{");
  });
});
