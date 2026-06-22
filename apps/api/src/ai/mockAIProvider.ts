import type { AgentResponseResult, AIProvider, GenerateAgentResponseInput } from "./aiProvider.js";

export class MockAIProvider implements AIProvider {
  name = "mock" as const;
  model = "deterministic-mock-v1";

  async generateAgentResponse(input: GenerateAgentResponseInput): Promise<AgentResponseResult> {
    const context = input.previousCouncilContext ? " Existing council context has been considered." : "";
    const memory = input.kingdomMemoryContext ? " Kingdom Memory Context was consulted." : "";
    const project = input.projectContext ? " Project Context was consulted." : "";
    const charter = input.kingdomContext ? " Operating under Kingdom Charter and Vision." : "";
    const skills = input.agentSkills.length > 0 ? input.agentSkills.slice(0, 3).join(", ") : input.agentRole;

    const response = buildRoleResponse({
      role: input.agentRole,
      name: input.agentName,
      mode: input.mode,
      skills,
      command: input.command,
      suffix: `${charter}${project}${memory}${context}`
    });

    const promptText = [
      input.systemPrompt,
      input.command,
      input.kingdomContext ?? "",
      input.projectContext ?? "",
      input.previousCouncilContext ?? "",
      input.kingdomMemoryContext ?? ""
    ].join(" ");
    const promptTokens = Math.ceil(promptText.length / 4);
    const completionTokens = Math.ceil(response.length / 4);

    return {
      response,
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      finishReason: "stop"
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

function buildRoleResponse(input: {
  role: string;
  name: string;
  mode: string;
  skills: string;
  command: string;
  suffix: string;
}): string {
  const normalized = input.role.toLowerCase();
  const prefix = `${input.role} counsel from ${input.name}: for this ${input.mode} decree, apply ${input.skills}.`;

  if (normalized.includes("archivist")) {
    return [
      "## Archivist Evidence Report",
      `${prefix} Evidence summary: the provided Royal command is the primary evidence source.${input.suffix}`,
      `Cited logs/artifacts/context: Project Context and Kingdom Memory Context when available.`,
      `Exact failing item or observed event: "${input.command}"`,
      "Candidate lesson/memory: preserve the observed failure pattern, evidence, lesson, and recommended future behavior for review.",
      `Royal command: "${input.command}"`
    ].join("\n\n");
  }
  if (normalized.includes("researcher")) {
    return [
      "## Researcher Hypotheses",
      `${prefix} Hypotheses ranked by likelihood: 1. contract or test expectation mismatch; 2. context/setup drift; 3. implementation regression.${input.suffix}`,
      "Likely root cause categories: test contract, data/schema drift, orchestration behavior.",
      "Evidence supporting or refuting each hypothesis: use the Archivist evidence and validation output; do not infer beyond supplied context.",
      `Royal command: "${input.command}"`
    ].join("\n\n");
  }
  if (normalized.includes("architect")) {
    return [
      "## Architect Patch Plan",
      `${prefix} Safe patch plan: inspect the failing path, update the smallest API/UI/service boundary, and keep changes scoped.${input.suffix}`,
      "Files to inspect/change: route, service, DTO, UI, and tests related to the command.",
      "Risk assessment: avoid weakening auth, context binding, secret handling, runner policy, or validation reporting.",
      "Validation commands: npm run test --workspace @ai-kingdom/api; npm run test --workspace @ai-kingdom/web; npm run test --workspace @ai-kingdom/runner; npm run test; npm run typecheck; npm run build.",
      "Rollback strategy: revert the scoped change and restore the previous tests if validation fails.",
      `Royal command: "${input.command}"`
    ].join("\n\n");
  }
  if (normalized.includes("general")) {
    return [
      "## General Execution Checklist",
      `${prefix} Execution checklist: confirm context, inspect evidence, implement only after approval, validate, and report outcomes.${input.suffix}`,
      "External-agent handoff checklist: include objective, evidence, files, risks, validation commands, and acceptance criteria.",
      "Acceptance criteria: role outputs are separate, learning candidate exists, and no patch/merge/deploy/PR is created automatically.",
      "Do-not-cross constraints: do not expose secrets, weaken runner auth, weaken context binding, auto-patch, auto-merge, auto-deploy, or auto-create PRs.",
      `Royal command: "${input.command}"`
    ].join("\n\n");
  }
  if (normalized.includes("vizier")) {
    return [
      "## Grand Vizier Final Decision",
      `${prefix} Final synthesis: weigh the Archivist evidence, Researcher hypotheses, Architect patch plan, and General checklist before acting.${input.suffix}`,
      "Decision framing: this is manual council counsel, not an execution approval.",
      "Recommended next action: create an external-agent handoff for review or proceed to a manual scoped implementation pass.",
      "Tradeoffs: speed improves with handoff clarity, but patching remains blocked until context and validation constraints are satisfied.",
      `Royal command: "${input.command}"`
    ].join("\n\n");
  }

  return `${prefix} ${mockGuidance(input.role)}${input.suffix} Royal command: "${input.command}"`;
}
