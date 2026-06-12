import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { hashToken } from "../middleware/runnerAuth.js";
import { assertSafeTestDatabase } from "../test/testDb.js";
import { bootstrapLocalRunner, LOCAL_RUNNER_NAME, printRunnerBootstrapSuccess } from "../services/runnerBootstrapService.js";
import { runRunnerBootstrapCommand } from "./runner-bootstrap.js";

assertSafeTestDatabase();

async function deleteLocalRunner(): Promise<void> {
  await prisma.agentRunner.deleteMany({ where: { name: LOCAL_RUNNER_NAME } });
}

test("runner bootstrap creates AgentRunner when missing", async () => {
  await deleteLocalRunner();
  const token = `create-${crypto.randomUUID()}`;

  try {
    const result = await bootstrapLocalRunner({ prisma, runnerToken: token, requireToken: true });
    assert.equal(result?.created, true);
    assert.equal(result?.runner.name, LOCAL_RUNNER_NAME);

    const runner = await prisma.agentRunner.findUnique({ where: { id: result!.runner.id } });
    assert.ok(runner, "runner should exist");
    assert.equal(runner!.tokenHash, hashToken(token));
    assert.notEqual(runner!.tokenHash, token);
  } finally {
    await deleteLocalRunner();
  }
});

test("runner bootstrap updates tokenHash when runner exists", async () => {
  await deleteLocalRunner();
  const oldToken = `old-${crypto.randomUUID()}`;
  const newToken = `new-${crypto.randomUUID()}`;
  const existing = await prisma.agentRunner.create({
    data: {
      name: LOCAL_RUNNER_NAME,
      description: "Existing test runner",
      tokenHash: hashToken(oldToken)
    }
  });

  try {
    const result = await bootstrapLocalRunner({ prisma, runnerToken: newToken, requireToken: true });
    assert.equal(result?.created, false);
    assert.equal(result?.runner.id, existing.id);

    const runner = await prisma.agentRunner.findUnique({ where: { id: existing.id } });
    assert.ok(runner, "runner should still exist");
    assert.equal(runner!.tokenHash, hashToken(newToken));
    assert.notEqual(runner!.tokenHash, hashToken(oldToken));
  } finally {
    await deleteLocalRunner();
  }
});

test("runner bootstrap does not print the plain token", async () => {
  await deleteLocalRunner();
  const token = `plain-token-${crypto.randomUUID()}`;
  const output: string[] = [];
  const logger = {
    log: (message?: unknown) => output.push(String(message ?? "")),
    warn: (message?: unknown) => output.push(String(message ?? "")),
    error: (message?: unknown) => output.push(String(message ?? ""))
  };

  try {
    const result = await bootstrapLocalRunner({ prisma, runnerToken: token, requireToken: true, logger });
    assert.ok(result);
    printRunnerBootstrapSuccess(result!, logger);

    const printed = output.join("\n");
    assert.equal(printed.includes(token), false, "plain RUNNER_TOKEN must not be printed");
    assert.equal(printed.includes(hashToken(token)), false, "token hash should not be printed");
  } finally {
    await deleteLocalRunner();
  }
});

test("runner:bootstrap command reports missing RUNNER_TOKEN clearly", async () => {
  const originalToken = process.env.RUNNER_TOKEN;
  const originalError = console.error;
  const errors: string[] = [];
  process.env.RUNNER_TOKEN = "";
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    const code = await runRunnerBootstrapCommand();
    assert.equal(code, 1);
    const message = errors.join("\n");
    assert.match(message, /RUNNER_TOKEN is required/);
    assert.match(message, /npm run runner:bootstrap/);
  } finally {
    if (originalToken === undefined) {
      delete process.env.RUNNER_TOKEN;
    } else {
      process.env.RUNNER_TOKEN = originalToken;
    }
    console.error = originalError;
  }
});
