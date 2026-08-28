import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AGENT_SKILLS_SCHEMA,
  agentSkills,
  buildApiCatalog,
  buildArdManifest,
  buildDiscoveryLinkHeader,
  buildRobotsText,
  CONTENT_SIGNAL_POLICY,
} from "./agent-readiness";
import { buildAgentSkillsIndex } from "./agent-skills-server";
import { NAYORI_API_ORIGIN } from "./discovery";

const origin = "https://preview.nayori.ai";

describe("agent readiness discovery", () => {
  it("publishes an RFC 9727 JSON linkset for the live quote API", () => {
    const catalog = buildApiCatalog(origin);
    const entry = catalog.linkset[0];

    expect(entry.anchor).toBe(`${origin}/api/v1`);
    expect(entry["service-desc"][0]).toEqual({
      href: `${NAYORI_API_ORIGIN}/openapi.json`,
      type: "application/openapi+json",
    });
    expect(entry["service-doc"][0].href).toBe(
      `${NAYORI_API_ORIGIN}/llms.txt`
    );
    expect(entry.status[0].href).toBe(`${NAYORI_API_ORIGIN}/health`);
  });

  it("describes only real ARD resources with search signals", () => {
    const manifest = buildArdManifest(origin);

    expect(manifest.specVersion).toBe("0.91");
    expect(manifest.host.identifier).toBe(origin);
    expect(manifest.entries.length).toBeGreaterThan(0);

    for (const entry of manifest.entries) {
      expect(entry.identifier).toMatch(/^urn:air:nayori\.ai:/);
      expect(entry.type).toMatch(/^application\//);
      expect("url" in entry).toBe(true);
      expect("data" in entry).toBe(false);
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(entry.representativeQueries.length).toBeLessThanOrEqual(5);
    }
  });

  it("publishes valid Agent Skills v0.2.0 entries and raw-byte digests", () => {
    const index = buildAgentSkillsIndex();

    expect(index.$schema).toBe(AGENT_SKILLS_SCHEMA);
    expect(index.skills).toHaveLength(agentSkills.length);

    for (const skill of agentSkills) {
      const entry = index.skills.find((candidate) => candidate.name === skill.name);
      const digest = createHash("sha256").update(skill.content).digest("hex");

      expect(skill.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(skill.content).toContain(`name: ${skill.name}`);
      expect(skill.content).toContain(`description: ${skill.description}`);
      expect(entry).toEqual({
        name: skill.name,
        type: "skill-md",
        description: skill.description,
        url: `/.well-known/agent-skills/${skill.name}/SKILL.md`,
        digest: `sha256:${digest}`,
      });
    }
  });

  it("states the content policy and advertises the canonical ARD map", () => {
    const robots = buildRobotsText(origin);

    expect(robots).toContain(`Content-Signal: ${CONTENT_SIGNAL_POLICY}`);
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
    expect(robots).toContain(
      `Agentmap: ${origin}/.well-known/ai-catalog.json`
    );
    expect(robots).toContain("Disallow: /api/chainhook");
  });

  it("advertises standards through HTTP Link relations", () => {
    const link = buildDiscoveryLinkHeader(origin);

    expect(link).toContain('rel="api-catalog"');
    expect(link).toContain('rel="service-desc"');
    expect(link).toContain('rel="service-doc"');
    expect(link).toContain('rel="payment"');
    expect(link).toContain(`${origin}/api/v1`);
    expect(link).toContain('rel="ard"');
    expect(link).toContain('rel="ai-catalog"');
    expect(link).toContain('rel="agent-skills"');
    expect(link).toContain('rel="authorization-server"');
    expect(link).toContain('rel="oauth-protected-resource"');
    expect(link).toContain('rel="mcp"');
    expect(link).toContain(`${origin}/api/evidence.json`);
  });
});
