import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemPrompt, buildUserPrompt } from "./openAICompatibleProvider.js";

const baseInput = {
  command: "Add authentication middleware to the API",
  mode: "BUILD" as const,
  agentName: "Seraphine",
  agentRole: "Royal Architect",
  agentSkills: ["architecture", "APIs", "data models"],
  systemPrompt: "Return a section titled 'Architect Execution Plan'.\nSpecify exact files to create or change.",
  responseStyle: "concise, structured"
};

test("buildUserPrompt: role contract drives format — no generic fallback instruction in user message", () => {
  const prompt = buildUserPrompt(baseInput);
  // The generic "Assessment, Recommendation, Risks, Next step" was conflicting with role contracts
  // (system message says "Return 'Architect Execution Plan'" but user message was overriding it).
  // Removing it lets the role-specific contract in the system message win.
  assert.ok(!prompt.includes("Assessment, Recommendation, Risks"), "Generic format instruction must not appear in user prompt — it overrides role contracts");
  assert.ok(!prompt.includes("structured council counsel"), "Generic format instruction must not appear in user prompt");
});

test("buildUserPrompt: contains task mode and command", () => {
  const prompt = buildUserPrompt(baseInput);
  assert.ok(prompt.includes("Task mode: BUILD"), "Should include task mode");
  assert.ok(prompt.includes("Royal command:"), "Should include command label");
  assert.ok(prompt.includes(baseInput.command), "Should include the decree text");
});

test("buildUserPrompt: previous council context included when provided", () => {
  const prompt = buildUserPrompt({
    ...baseInput,
    previousCouncilContext: "Archivist Evidence Report:\nNo prior issues found."
  });
  assert.ok(prompt.includes("Previous council context:"), "Should include council context section");
  assert.ok(prompt.includes("Archivist Evidence Report"), "Should include council context content");
});

test("buildUserPrompt: kingdom memory context included when provided", () => {
  const prompt = buildUserPrompt({
    ...baseInput,
    kingdomMemoryContext: "[APPROVED KNOWLEDGE]\n[BUG_LEARNING] Always validate inputs: Validate at boundaries."
  });
  assert.ok(prompt.includes("Kingdom Memory Context:"), "Should include memory context label");
  assert.ok(prompt.includes("APPROVED KNOWLEDGE"), "Should include knowledge content");
});

test("buildUserPrompt: omits empty optional sections", () => {
  const prompt = buildUserPrompt(baseInput);
  assert.ok(!prompt.includes("Previous council context:"), "Should omit empty council context");
  assert.ok(!prompt.includes("Kingdom Memory Context:"), "Should omit empty memory context");
});

test("buildSystemPrompt: role contract appears in system message", () => {
  const prompt = buildSystemPrompt({
    ...baseInput,
    kingdomContext: undefined,
    projectContext: undefined
  });
  assert.ok(prompt.includes("Architect Execution Plan"), "Role contract must appear in system prompt");
  assert.ok(prompt.includes("Royal role: Royal Architect"), "Role declaration must appear");
  assert.ok(prompt.includes("Skills: architecture"), "Skills must appear");
});

test("buildSystemPrompt: planner JSON instruction not overridden — role contract is the authority", () => {
  const plannerPrompt = buildSystemPrompt({
    ...baseInput,
    systemPrompt: "Output ONLY a valid JSON array — no prose, no markdown fences.",
    agentRole: "Royal Planner",
    agentSkills: ["planning", "work orders"]
  });
  const userPrompt = buildUserPrompt({
    ...baseInput,
    command: "Review the BUILD council session and Kingdom context below. Generate 0-3 execution-ready draft work orders as a JSON array. Return only the JSON array."
  });
  // The planner system prompt says JSON only. The user message must not contradict it.
  assert.ok(plannerPrompt.includes("Output ONLY a valid JSON array"), "Planner JSON instruction must be in system prompt");
  assert.ok(!userPrompt.includes("Assessment, Recommendation"), "User prompt must not override planner JSON instruction");
  assert.ok(userPrompt.includes("Return only the JSON array"), "Command's JSON instruction must remain in user prompt");
});
