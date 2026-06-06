import type { AgentResponseResult, AIProvider, GenerateAgentResponseInput } from "./aiProvider.js";

export class MockAIProvider implements AIProvider {
  name = "mock" as const;
  model = "deterministic-mock-v1";

  async generateAgentResponse(input: GenerateAgentResponseInput): Promise<AgentResponseResult> {
    const context = input.previousCouncilContext ? " Existing council context has been considered." : "";
    const memory = input.kingdomMemoryContext ? " Kingdom Memory Context was consulted." : "";
    const charter = input.kingdomContext ? " Operating under Kingdom Charter and Vision." : "";
    const skills = input.agentSkills.length > 0 ? input.agentSkills.slice(0, 3).join(", ") : input.agentRole;

    const response = `${input.agentRole} counsel from ${input.agentName}: for this ${input.mode} decree, apply ${skills}. ${mockGuidance(input.agentRole)}${charter}${memory}${context} Royal command: "${input.command}"`;

    const promptText = [
      input.systemPrompt,
      input.command,
      input.kingdomContext ?? "",
      input.previousCouncilContext ?? "",
      input.kingdomMemoryContext ?? ""
    ].join(" ");
    const promptTokens = Math.ceil(promptText.length / 4);
    const completionTokens = Math.ceil(response.length / 4);

    return {
      response,
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
    };
  }
}

function mockGuidance(role: string): string {
  const normalized = role.toLowerCase();

  if (normalized.includes("vizier")) {
    return "Synthesize the council into a clear decision, name the next action, and preserve the tradeoffs.";
  }
  if (normalized.includes("architect")) {
    return "Define the implementation boundary, data contracts, and the smallest durable technical path.";
  }
  if (normalized.includes("general")) {
    return "Sequence the work into milestones, owners, risks, and checkpoints.";
  }
  if (normalized.includes("researcher")) {
    return "Separate evidence from assumptions and identify the unknowns that must be resolved.";
  }
  if (normalized.includes("treasurer")) {
    return "Estimate cost, recurring spend, return, and budget risk before committing resources.";
  }

  return "Provide practical counsel with clear constraints and next steps.";
}
