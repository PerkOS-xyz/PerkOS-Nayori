import { createHash } from "node:crypto";
import { AGENT_SKILLS_SCHEMA, agentSkills } from "./agent-readiness";

export function buildAgentSkillsIndex() {
  return {
    $schema: AGENT_SKILLS_SCHEMA,
    skills: agentSkills.map(({ name, description, content }) => ({
      name,
      type: "skill-md" as const,
      description,
      url: `/.well-known/agent-skills/${name}/SKILL.md`,
      digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    })),
  };
}
