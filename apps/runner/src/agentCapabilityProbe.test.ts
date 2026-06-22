import { test } from "node:test";
import assert from "node:assert/strict";
import { probeAgentCapabilities, extractExecutable } from "./agentCapabilityProbe.js";

test("extractExecutable pulls the binary token from command templates", () => {
  assert.equal(extractExecutable("claude -p {PROMPT}"), "claude");
  assert.equal(extractExecutable("/opt/homebrew/bin/claude -p --dangerously-skip-permissions < {promptFile}"), "/opt/homebrew/bin/claude");
  assert.equal(extractExecutable("   "), null);
});

test("probe marks an agent available when its executable resolves", () => {
  const caps = probeAgentCapabilities({}, (exe) => exe === "claude");
  const claude = caps.find((c) => c.type === "CLAUDE_CODE");
  assert.ok(claude);
  assert.equal(claude.available, true);
  assert.equal(claude.command, "claude");
  assert.equal(claude.source, "default");
});

test("probe marks agents unavailable when nothing resolves, with a reason", () => {
  const caps = probeAgentCapabilities({}, () => false);
  assert.ok(caps.length >= 8);
  for (const c of caps) {
    assert.equal(c.available, false);
    assert.ok(c.detail && c.detail.length > 0);
  }
});

test("explicit AGENT_CLI_<TYPE>_COMMAND env overrides the default and is marked source=env", () => {
  const env = { AGENT_CLI_CODEX_COMMAND: "/usr/local/bin/codex --json" } as NodeJS.ProcessEnv;
  const caps = probeAgentCapabilities(env, (exe) => exe === "/usr/local/bin/codex");
  const codex = caps.find((c) => c.type === "CODEX");
  assert.ok(codex);
  assert.equal(codex.source, "env");
  assert.equal(codex.command, "/usr/local/bin/codex");
  assert.equal(codex.available, true);
});

test("probe covers the King's newly added agent types (cursor, devin)", () => {
  const caps = probeAgentCapabilities({}, () => false);
  assert.ok(caps.some((c) => c.type === "CURSOR"));
  assert.ok(caps.some((c) => c.type === "DEVIN"));
});
