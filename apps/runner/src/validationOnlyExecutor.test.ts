import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_VALIDATION_COMMANDS,
  buildValidationCommands,
  executeValidationOnlyJob,
  isAllowedValidationCommand,
  type ExecuteValidationOnlyDeps,
  type ValidationOnlyJob
} from "./validationOnlyExecutor.js";

const job: ValidationOnlyJob = {
  id: "job-validation-1",
  mode: "VALIDATION_ONLY",
  workOrder: { id: "wo-1", title: "Verify feature X" }
};

type Call = { method: string; args: unknown[] };

function makeDeps(opts?: {
  exitCodeFor?: (command: string, args: string[]) => number;
  hasLint?: boolean;
  failPrepare?: boolean;
}) {
  const calls: Call[] = [];
  const apiCalls: Call[] = [];
  const ranCommands: string[] = [];

  // Proxy records every API method invocation so we can assert that no
  // patch-artifact or branch-push style method is ever called.
  const api = new Proxy({}, {
    get(_target, prop: string) {
      return (...args: unknown[]) => {
        apiCalls.push({ method: prop, args });
        return Promise.resolve();
      };
    }
  }) as ExecuteValidationOnlyDeps["api"];

  const deps: ExecuteValidationOnlyDeps = {
    api,
    runCommand: async (command, args) => {
      ranCommands.push(`${command} ${args.join(" ")}`);
      const exitCode = opts?.exitCodeFor ? opts.exitCodeFor(command, args) : 0;
      return { exitCode, output: `output of ${command}`, durationMs: 5 };
    },
    prepareWorkspace: async () => {
      calls.push({ method: "prepareWorkspace", args: [] });
      if (opts?.failPrepare) throw new Error("no repo configured");
    },
    hasLintScript: () => opts?.hasLint ?? false
  };
  return { deps, apiCalls, ranCommands };
}

test("VALIDATION_ONLY runs allowlisted validation commands only", async () => {
  const { deps, ranCommands } = makeDeps({ hasLint: true });
  await executeValidationOnlyJob(job, deps);

  assert.deepEqual(ranCommands, [
    "git status",
    "git diff --stat",
    "npm run typecheck",
    "npm run test",
    "npm run build",
    "npm run lint"
  ]);
  for (const cmd of ranCommands) {
    const [command, ...args] = cmd.split(" ");
    assert.equal(isAllowedValidationCommand(command!, args), true, `expected ${cmd} to be allowlisted`);
  }
});

test("VALIDATION_ONLY blocks git add/commit/push and other mutations", async () => {
  assert.equal(isAllowedValidationCommand("git", ["add", "."]), false);
  assert.equal(isAllowedValidationCommand("git", ["commit", "-m", "msg"]), false);
  assert.equal(isAllowedValidationCommand("git", ["push", "origin", "kingdom/job-1-x"]), false);
  assert.equal(isAllowedValidationCommand("git", ["checkout", "-b", "kingdom/job-1-x"]), false);
  assert.equal(isAllowedValidationCommand("git", ["diff"]), false);
  assert.equal(isAllowedValidationCommand("npm", ["install"]), false);
  assert.equal(isAllowedValidationCommand("rm", ["-rf", "."]), false);

  // Defense in depth: even if a mutation command sneaks into the command list,
  // the executor must block it instead of running it.
  const { deps, ranCommands, apiCalls } = makeDeps();
  BASE_VALIDATION_COMMANDS.push({ command: "git", args: ["push", "origin", "main"], isTest: false });
  try {
    await executeValidationOnlyJob(job, deps);
  } finally {
    BASE_VALIDATION_COMMANDS.pop();
  }
  assert.ok(!ranCommands.includes("git push origin main"), "git push must never execute");
  const blockedStep = apiCalls.find((c) => c.method === "recordStep" && (c.args[1] as { status: string }).status === "BLOCKED");
  assert.ok(blockedStep, "expected a BLOCKED step record for the mutation command");
  const report = apiCalls.find((c) => c.method === "submitReport");
  assert.ok(report);
  const reportBody = report!.args[1] as { errors: string[] };
  assert.ok(reportBody.errors.some((e) => e.includes("git push")), "report should mention the blocked command");
});

test("VALIDATION_ONLY does not create a patch artifact or push a branch", async () => {
  const { deps, apiCalls } = makeDeps();
  await executeValidationOnlyJob(job, deps);

  const methods = new Set(apiCalls.map((c) => c.method));
  assert.ok(!methods.has("submitPatchArtifact"), "must not submit a patch artifact");
  assert.ok(!methods.has("markBranchPushed"), "must not push a branch");
  assert.deepEqual([...methods].sort(), ["recordStep", "submitReport", "updateStatus"]);

  const report = apiCalls.find((c) => c.method === "submitReport");
  const reportBody = report!.args[1] as { filesChanged: string[] };
  assert.deepEqual(reportBody.filesChanged, [], "validation must not change files");
});

test("report submission includes validation result and commands run", async () => {
  const passed = makeDeps();
  await executeValidationOnlyJob(job, passed.deps);
  const passedReport = passed.apiCalls.find((c) => c.method === "submitReport")!.args[1] as {
    testResult: string; testsRun: string[]; commandsRun: string[]; summary: string;
  };
  assert.equal(passedReport.testResult, "PASSED");
  assert.deepEqual(passedReport.testsRun, ["npm run typecheck", "npm run test", "npm run build"]);
  assert.ok(passedReport.commandsRun.includes("git status"));
  assert.ok(passedReport.summary.includes("Validation-only"));

  const mixed = makeDeps({ exitCodeFor: (_cmd, args) => (args[1] === "test" ? 1 : 0) });
  await executeValidationOnlyJob(job, mixed.deps);
  const mixedReport = mixed.apiCalls.find((c) => c.method === "submitReport")!.args[1] as {
    testResult: string; errors: string[]; remainingWork: string[];
  };
  assert.equal(mixedReport.testResult, "PARTIAL");
  assert.ok(mixedReport.errors.some((e) => e.includes("npm run test")));
  assert.ok(mixedReport.remainingWork.length > 0);

  const notRun = makeDeps({ failPrepare: true });
  await executeValidationOnlyJob(job, notRun.deps);
  const notRunReport = notRun.apiCalls.find((c) => c.method === "submitReport")!.args[1] as {
    testResult: string; errors: string[];
  };
  assert.equal(notRunReport.testResult, "NOT_RUN");
  assert.ok(notRunReport.errors.some((e) => e.includes("Workspace setup failed")));
});

test("buildValidationCommands includes lint only when the script exists", () => {
  assert.ok(buildValidationCommands(true).some((c) => c.args[1] === "lint"));
  assert.ok(!buildValidationCommands(false).some((c) => c.args[1] === "lint"));
});

// ── M17E-2: context binding warnings ─────────────────────────────────────────────

test("VALIDATION_ONLY proceeds with PARTIAL context and reports a context warning", async () => {
  const partialJob: ValidationOnlyJob = {
    id: "job-validation-partial",
    mode: "VALIDATION_ONLY",
    workOrder: { id: "wo-2", title: "Verify with partial context" },
    localDocumentSnapshotId: "snap-1",
    repositorySnapshotId: null,
    contextValidationStatus: "PARTIAL"
  };
  const { deps, apiCalls, ranCommands } = makeDeps();
  await executeValidationOnlyJob(partialJob, deps);

  assert.ok(ranCommands.length > 0, "validation must still run with PARTIAL context");
  const report = apiCalls.find((c) => c.method === "submitReport")!.args[1] as {
    summary: string;
    contextUsed: { localDocumentSnapshotId: string | null; contextValidationStatus: string; warnings: string[] };
  };
  assert.ok(report.summary.includes("PARTIAL project context"), "summary must carry the context warning");
  assert.equal(report.contextUsed.contextValidationStatus, "PARTIAL");
  assert.equal(report.contextUsed.localDocumentSnapshotId, "snap-1");
  assert.ok(report.contextUsed.warnings.some((w) => w.includes("PARTIAL")), "contextUsed must include the warning");
});

test("VALIDATION_ONLY report includes contextUsed snapshot ids when context is FRESH", async () => {
  const freshJob: ValidationOnlyJob = {
    id: "job-validation-fresh",
    mode: "VALIDATION_ONLY",
    workOrder: { id: "wo-3", title: "Verify with fresh context" },
    localDocumentSnapshotId: "snap-fresh",
    repositorySnapshotId: "repo-snap-1",
    contextValidationStatus: "FRESH"
  };
  const { deps, apiCalls } = makeDeps();
  await executeValidationOnlyJob(freshJob, deps);

  const report = apiCalls.find((c) => c.method === "submitReport")!.args[1] as {
    summary: string;
    contextUsed: { localDocumentSnapshotId: string | null; repositorySnapshotId: string | null; contextValidationStatus: string; warnings: string[] };
  };
  assert.equal(report.contextUsed.localDocumentSnapshotId, "snap-fresh");
  assert.equal(report.contextUsed.repositorySnapshotId, "repo-snap-1");
  assert.equal(report.contextUsed.contextValidationStatus, "FRESH");
  assert.deepEqual(report.contextUsed.warnings, []);
  assert.ok(!report.summary.includes("project context"), "no context warning for FRESH context");
});
