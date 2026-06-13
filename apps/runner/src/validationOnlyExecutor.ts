/**
 * VALIDATION_ONLY job executor (M17D-2).
 *
 * Hard constraints:
 * - Runs allowlisted validation commands only
 * - No model-driven file edits
 * - No git add/commit/push
 * - No patch artifact submission
 * - Workspace copy is the only filesystem mutation (temporary setup)
 */

export interface ValidationCommandSpec {
  command: string;
  args: string[];
  /** Counts toward the PASSED/FAILED/PARTIAL test result */
  isTest: boolean;
}

export const BASE_VALIDATION_COMMANDS: ValidationCommandSpec[] = [
  { command: "git", args: ["status"], isTest: false },
  { command: "git", args: ["diff", "--stat"], isTest: false },
  { command: "npm", args: ["run", "typecheck"], isTest: true },
  { command: "npm", args: ["run", "test"], isTest: true },
  { command: "npm", args: ["run", "build"], isTest: true }
];

export const LINT_COMMAND: ValidationCommandSpec = { command: "npm", args: ["run", "lint"], isTest: true };

const ALLOWED_NPM_VALIDATION_SCRIPTS = new Set(["typecheck", "test", "build", "lint"]);

/**
 * Strict allowlist for VALIDATION_ONLY jobs. Narrower than the global sandbox
 * allowlist: git is read-only here (no checkout/add/commit/push) and npm may
 * only run the approved validation scripts.
 */
export function isAllowedValidationCommand(command: string, args: string[]): boolean {
  if (command === "git") {
    if (args.length === 1 && args[0] === "status") return true;
    if (args.length === 2 && args[0] === "diff" && args[1] === "--stat") return true;
    return false;
  }
  if (command === "npm") {
    return args.length === 2 && args[0] === "run" && ALLOWED_NPM_VALIDATION_SCRIPTS.has(args[1] ?? "");
  }
  return false;
}

export function buildValidationCommands(hasLintScript: boolean): ValidationCommandSpec[] {
  return hasLintScript ? [...BASE_VALIDATION_COMMANDS, LINT_COMMAND] : [...BASE_VALIDATION_COMMANDS];
}

export type ValidationTestResult = "NOT_RUN" | "PASSED" | "FAILED" | "PARTIAL";

export interface ValidationJobApi {
  updateStatus(jobId: string, status: string, data?: { logsPreview?: string }): Promise<unknown>;
  recordStep(jobId: string, step: {
    sequence: number;
    stepType: string;
    title: string;
    status: string;
    command?: string | null;
    args?: string[];
    output?: string | null;
    exitCode?: number | null;
    durationMs?: number | null;
  }): Promise<unknown>;
  submitReport(jobId: string, report: {
    summary: string;
    filesChanged: string[];
    commandsRun: string[];
    testsRun: string[];
    testResult: ValidationTestResult;
    errors: string[];
    decisionsMade: string[];
    remainingWork: string[];
    nextRecommendedAction?: string | null;
    rawOutput?: string | null;
    logsPreview?: string | null;
    contextUsed?: Record<string, unknown> | null;
  }): Promise<unknown>;
}

export interface ValidationCommandResult {
  exitCode: number;
  output: string;
  durationMs: number;
}

export interface ValidationDependencyInstallResult {
  skipped: boolean;
  success: boolean;
  displayCommand: string;
  exitCode: number;
  output: string;
  durationMs: number;
}

export interface ValidationPreValidationStepResult {
  displayCommand: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
  durationMs: number;
  success: boolean;
}

export interface ValidationPreValidationResult {
  success: boolean;
  failureMessage: string | null;
  steps: ValidationPreValidationStepResult[];
}

export interface ExecuteValidationOnlyDeps {
  api: ValidationJobApi;
  runCommand: (command: string, args: string[]) => Promise<ValidationCommandResult>;
  /** Copies the repository into the temporary workspace. Must not touch the source repo. */
  prepareWorkspace: () => Promise<void>;
  validateEnvironment?: () => { ok: true } | { ok: false; message: string };
  getForwardedEnvNames?: () => string[];
  /** Installs dependencies in the prepared workspace before validation commands run. */
  installDependencies?: () => Promise<ValidationDependencyInstallResult>;
  /** Runs generated-code setup after dependencies are installed and before validation. */
  runPreValidation?: () => Promise<ValidationPreValidationResult>;
  /** Whether the workspace package.json declares a lint script. */
  hasLintScript: () => boolean;
  sanitize?: (text: string) => string;
  log?: (msg: string) => void;
}

export interface ValidationOnlyJob {
  id: string;
  mode: string;
  workOrder: { id: string; title: string };
  /** M17E-2 context binding metadata (absent on legacy jobs). */
  localDocumentSnapshotId?: string | null;
  repositorySnapshotId?: string | null;
  contextValidationStatus?: string | null;
  contextValidationSummary?: Record<string, unknown> | null;
}

/** M17E-2: validation-only jobs proceed with degraded context but must surface a warning. */
export function buildValidationContextWarnings(contextValidationStatus: string | null | undefined): string[] {
  if (contextValidationStatus === "PARTIAL") {
    return ["Context warning: validation ran with PARTIAL project context; results may not reflect the full project state."];
  }
  if (contextValidationStatus === "STALE") {
    return ["Context warning: validation ran with STALE project context; re-scan local docs before trusting results."];
  }
  if (contextValidationStatus === "MISSING") {
    return ["Context warning: validation ran without a bound project context snapshot."];
  }
  return [];
}

export async function executeValidationOnlyJob(job: ValidationOnlyJob, deps: ExecuteValidationOnlyDeps): Promise<void> {
  const sanitize = deps.sanitize ?? ((t: string) => t);
  const log = deps.log ?? (() => undefined);
  const commandsRun: string[] = [];
  const testsRun: string[] = [];
  const errors: string[] = [];
  const logLines: string[] = [];
  let sequence = 0;

  await deps.api.updateStatus(job.id, "RUNNING");
  log(`[Job ${job.id}] VALIDATION_ONLY mode — no file edits, no patch artifact, no git mutations.`);

  try {
    await deps.prepareWorkspace();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Workspace setup failed: ${msg}`);
    await deps.api.submitReport(job.id, {
      summary: `Validation-only run for "${job.workOrder.title}" could not start: workspace setup failed.`,
      filesChanged: [],
      commandsRun: [],
      testsRun: [],
      testResult: "NOT_RUN",
      errors,
      decisionsMade: [],
      remainingWork: ["Configure runner workspace source (RUNNER_REPO_PATH) and re-run validation."],
      nextRecommendedAction: "Fix runner workspace configuration",
      logsPreview: sanitize(msg).slice(0, 2000)
    });
    await deps.api.updateStatus(job.id, "FAILED", { logsPreview: sanitize(msg).slice(0, 2000) });
    return;
  }

  const envCheck = deps.validateEnvironment?.();
  if (envCheck && !envCheck.ok) {
    errors.push(envCheck.message);
    const logsPreview = sanitize(envCheck.message).slice(0, 2000);
    await deps.api.submitReport(job.id, {
      summary: `Validation-only run for "${job.workOrder.title}" could not start: ${envCheck.message}.`,
      filesChanged: [],
      commandsRun: [],
      testsRun: [],
      testResult: "NOT_RUN",
      errors,
      decisionsMade: [],
      remainingWork: ["Start the runner with TEST_DATABASE_URL or DATABASE_URL available in its process environment."],
      nextRecommendedAction: "Fix runner validation environment",
      rawOutput: logsPreview,
      logsPreview,
      contextUsed: {
        localDocumentSnapshotId: job.localDocumentSnapshotId ?? null,
        repositorySnapshotId: job.repositorySnapshotId ?? null,
        contextValidationStatus: job.contextValidationStatus ?? "NOT_REQUIRED"
      }
    });
    await deps.api.updateStatus(job.id, "FAILED", { logsPreview });
    return;
  }

  const forwardedNames = deps.getForwardedEnvNames?.() ?? [];
  log(`[Job ${job.id}] Forwarded validation env: ${forwardedNames.length > 0 ? forwardedNames.join(", ") : "(none)"}`);

  if (deps.installDependencies) {
    const installResult = await deps.installDependencies();
    if (installResult.skipped) {
      log(`[Job ${job.id}] Dependency installation skipped.`);
    } else {
      commandsRun.push(installResult.displayCommand);
      logLines.push(`$ ${installResult.displayCommand}\n${installResult.output}`);
      if (!installResult.success) {
        errors.push("Runner dependency installation failed");
        errors.push(`Exit ${installResult.exitCode}: ${installResult.displayCommand}`);
        const logsPreview = sanitize(logLines.join("\n")).slice(-9000);
        await deps.api.submitReport(job.id, {
          summary: `Validation-only run for "${job.workOrder.title}" could not continue: Runner dependency installation failed.`,
          filesChanged: [],
          commandsRun,
          testsRun,
          testResult: "NOT_RUN",
          errors,
          decisionsMade: [],
          remainingWork: ["Review dependency installation output and retry validation after dependencies can be installed."],
          nextRecommendedAction: "Fix runner dependency installation",
          rawOutput: logsPreview,
          logsPreview,
          contextUsed: {
            localDocumentSnapshotId: job.localDocumentSnapshotId ?? null,
            repositorySnapshotId: job.repositorySnapshotId ?? null,
            contextValidationStatus: job.contextValidationStatus ?? "NOT_REQUIRED"
          }
        });
        return;
      }
    }
  }

  if (deps.runPreValidation) {
    const preValidationResult = await deps.runPreValidation();
    for (const step of preValidationResult.steps) {
      sequence++;
      commandsRun.push(step.displayCommand);
      logLines.push(`$ ${step.displayCommand}\nCWD: ${step.cwd}\nSTDOUT:\n${step.stdout}\nSTDERR:\n${step.stderr}`);
      await deps.api.recordStep(job.id, {
        sequence,
        stepType: "COMMAND",
        title: `Pre-validation: ${step.displayCommand}`,
        status: step.success ? "COMPLETED" : "FAILED",
        command: "npm",
        args: ["run", "db:generate"],
        output: sanitize(step.output).slice(0, 4000),
        exitCode: step.exitCode,
        durationMs: step.durationMs
      });
    }

    if (!preValidationResult.success) {
      const failureMessage = preValidationResult.failureMessage ?? "Runner pre-validation failed";
      errors.push(failureMessage);
      const logsPreview = sanitize(logLines.join("\n")).slice(-9000);
      await deps.api.submitReport(job.id, {
        summary: `Validation-only run for "${job.workOrder.title}" could not continue: ${failureMessage}.`,
        filesChanged: [],
        commandsRun,
        testsRun,
        testResult: "NOT_RUN",
        errors,
        decisionsMade: [],
        remainingWork: ["Review pre-validation output and retry validation after generated clients can be prepared."],
        nextRecommendedAction: "Fix runner pre-validation",
        rawOutput: logsPreview,
        logsPreview,
        contextUsed: {
          localDocumentSnapshotId: job.localDocumentSnapshotId ?? null,
          repositorySnapshotId: job.repositorySnapshotId ?? null,
          contextValidationStatus: job.contextValidationStatus ?? "NOT_REQUIRED"
        }
      });
      return;
    }
  }

  const commands = buildValidationCommands(deps.hasLintScript());
  let testPasses = 0;
  let testFailures = 0;

  for (const spec of commands) {
    sequence++;
    const label = `${spec.command} ${spec.args.join(" ")}`;

    // Defense in depth: every command re-checked against the validation allowlist.
    if (!isAllowedValidationCommand(spec.command, spec.args)) {
      errors.push(`Blocked non-validation command: ${label}`);
      await deps.api.recordStep(job.id, {
        sequence, stepType: "COMMAND", title: label, status: "BLOCKED",
        command: spec.command, args: spec.args, output: "[BLOCKED] Not an allowlisted validation command", exitCode: -1
      });
      continue;
    }

    log(`[Job ${job.id}] Validation step ${sequence}: ${label}`);
    const result = await deps.runCommand(spec.command, spec.args);
    commandsRun.push(label);
    if (spec.isTest) {
      testsRun.push(label);
      if (result.exitCode === 0) testPasses++; else testFailures++;
    }
    if (result.exitCode !== 0) errors.push(`Exit ${result.exitCode}: ${label}`);
    logLines.push(`$ ${label}\n${result.output}`);

    await deps.api.recordStep(job.id, {
      sequence, stepType: "COMMAND", title: label,
      status: result.exitCode === 0 ? "COMPLETED" : "FAILED",
      command: spec.command, args: spec.args,
      output: sanitize(result.output).slice(0, 4000),
      exitCode: result.exitCode, durationMs: result.durationMs
    });
  }

  let testResult: ValidationTestResult = "NOT_RUN";
  if (testPasses > 0 && testFailures === 0) testResult = "PASSED";
  else if (testFailures > 0 && testPasses === 0) testResult = "FAILED";
  else if (testPasses > 0 && testFailures > 0) testResult = "PARTIAL";

  const contextWarnings = buildValidationContextWarnings(job.contextValidationStatus);
  for (const warning of contextWarnings) log(`[Job ${job.id}] ${warning}`);

  const summary = `Validation-only run for "${job.workOrder.title}": ${testsRun.length} check(s) run, result ${testResult}. No files modified, no patch generated.${contextWarnings.length > 0 ? ` ${contextWarnings.join(" ")}` : ""}`;
  const logsPreview = sanitize(logLines.join("\n")).slice(-9000);

  await deps.api.submitReport(job.id, {
    summary,
    filesChanged: [],
    commandsRun,
    testsRun,
    testResult,
    errors,
    decisionsMade: [],
    remainingWork: testFailures > 0 ? ["Review failing validation commands before approving the work order."] : [],
    nextRecommendedAction: testFailures > 0 ? "Review validation failures in the implementation report" : "Review validation results and work order",
    rawOutput: logsPreview,
    logsPreview,
    contextUsed: {
      localDocumentSnapshotId: job.localDocumentSnapshotId ?? null,
      repositorySnapshotId: job.repositorySnapshotId ?? null,
      contextValidationStatus: job.contextValidationStatus ?? "NOT_REQUIRED",
      warnings: contextWarnings
    }
  });

  log(`[Job ${job.id}] Validation report submitted (${testResult}). Job is NEEDS_REVIEW.`);
}
