import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import { resolveAgentCliConfig, runAgentCli } from "./agentCliRunner.js";

test("resolveAgentCliConfig is disabled unless AGENT_CLI_ENABLED=true", () => {
  const r = resolveAgentCliConfig("CLAUDE_CODE", {});
  assert.equal(r.enabled, false);
  if (!r.enabled) assert.match(r.reason, /AGENT_CLI_ENABLED/);
});

test("resolveAgentCliConfig requires a per-type command", () => {
  const r = resolveAgentCliConfig("CLAUDE_CODE", { AGENT_CLI_ENABLED: "true" });
  assert.equal(r.enabled, false);
  if (!r.enabled) assert.match(r.reason, /AGENT_CLI_CLAUDE_CODE_COMMAND/);
});

test("resolveAgentCliConfig parses JSON args and detects {PROMPT}", () => {
  const r = resolveAgentCliConfig("CLAUDE_CODE", {
    AGENT_CLI_ENABLED: "true",
    AGENT_CLI_CLAUDE_CODE_COMMAND: "claude",
    AGENT_CLI_CLAUDE_CODE_ARGS: '["-p","{PROMPT}"]'
  });
  assert.equal(r.enabled, true);
  if (r.enabled) {
    assert.equal(r.config.command, "claude");
    assert.deepEqual(r.config.args, ["-p", "{PROMPT}"]);
    assert.equal(r.config.promptViaStdin, false);
  }
});

test("resolveAgentCliConfig falls back to stdin when no {PROMPT} token and splits plain args", () => {
  const r = resolveAgentCliConfig("CODEX", {
    AGENT_CLI_ENABLED: "true",
    AGENT_CLI_CODEX_COMMAND: "codex",
    AGENT_CLI_CODEX_ARGS: "exec --quiet"
  });
  assert.equal(r.enabled, true);
  if (r.enabled) {
    assert.deepEqual(r.config.args, ["exec", "--quiet"]);
    assert.equal(r.config.promptViaStdin, true);
  }
});

test("resolveAgentCliConfig honors a per-type timeout override", () => {
  const r = resolveAgentCliConfig("CODEX", {
    AGENT_CLI_ENABLED: "true",
    AGENT_CLI_CODEX_COMMAND: "codex",
    AGENT_CLI_CODEX_TIMEOUT_MS: "900000"
  });
  assert.equal(r.enabled, true);
  if (r.enabled) assert.equal(r.config.timeoutMs, 900000);
});

test("runAgentCli passes the prompt as a {PROMPT} arg and captures stdout", async () => {
  // Use node itself as a harmless 'CLI' that echoes its argument.
  const result = await runAgentCli({
    config: { command: process.execPath, args: ["-e", "process.stdout.write(process.argv[1])", "{PROMPT}"], promptViaStdin: false, timeoutMs: 10000 },
    prompt: "hello-kingdom",
    workspaceRoot: os.tmpdir()
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /hello-kingdom/);
});

test("runAgentCli writes the prompt to stdin when no {PROMPT} token is present", async () => {
  const result = await runAgentCli({
    config: { command: process.execPath, args: ["-e", "process.stdin.on('data',d=>process.stdout.write(d))"], promptViaStdin: true, timeoutMs: 10000 },
    prompt: "via-stdin-123",
    workspaceRoot: os.tmpdir()
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /via-stdin-123/);
});
