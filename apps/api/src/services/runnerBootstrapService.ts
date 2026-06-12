import { Prisma, type AgentRunner, type PrismaClient } from "@prisma/client";
import { hashToken } from "../middleware/runnerAuth.js";

export const LOCAL_RUNNER_NAME = "Local Runner";
const LOCAL_RUNNER_DESCRIPTION = "Local development sandbox runner bootstrapped from RUNNER_TOKEN.";

export class RunnerBootstrapMissingTokenError extends Error {
  constructor() {
    super("RUNNER_TOKEN is required. Add RUNNER_TOKEN to the root .env or export it, then run npm run runner:bootstrap.");
    this.name = "RunnerBootstrapMissingTokenError";
  }
}

export class RunnerBootstrapTokenConflictError extends Error {
  constructor(existingRunnerName: string) {
    super(`RUNNER_TOKEN already belongs to another runner (${existingRunnerName}). Update or remove that runner before bootstrapping Local Runner.`);
    this.name = "RunnerBootstrapTokenConflictError";
  }
}

type RunnerBootstrapLogger = Pick<Console, "log" | "warn" | "error">;

export type RunnerBootstrapResult = {
  runner: Pick<AgentRunner, "id" | "name">;
  created: boolean;
};

type BootstrapOptions = {
  prisma: PrismaClient;
  runnerToken?: string;
  requireToken?: boolean;
  logger?: RunnerBootstrapLogger;
};

function agentRunnerHasField(fieldName: string): boolean {
  return Prisma.dmmf.datamodel.models
    .find((model) => model.name === "AgentRunner")
    ?.fields.some((field) => field.name === fieldName) ?? false;
}

function createRunnerData(tokenHash: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    name: LOCAL_RUNNER_NAME,
    description: LOCAL_RUNNER_DESCRIPTION,
    tokenHash
  };

  if (agentRunnerHasField("isActive")) {
    data.isActive = true;
  }

  return data;
}

function updateRunnerData(tokenHash: string): Record<string, unknown> {
  const data = createRunnerData(tokenHash);
  delete data.description;
  return data;
}

export async function bootstrapLocalRunner(options: BootstrapOptions): Promise<RunnerBootstrapResult | null> {
  const { prisma, logger = console, requireToken = false } = options;
  const runnerToken = options.runnerToken?.trim();

  if (!runnerToken) {
    if (requireToken) {
      throw new RunnerBootstrapMissingTokenError();
    }
    logger.warn("[Runner Bootstrap] RUNNER_TOKEN is not set; skipping Local Runner bootstrap.");
    return null;
  }

  const tokenHash = hashToken(runnerToken);

  return prisma.$transaction(async (tx) => {
    const existingLocalRunner = await tx.agentRunner.findFirst({ where: { name: LOCAL_RUNNER_NAME } });
    const existingTokenRunner = await tx.agentRunner.findUnique({ where: { tokenHash } });

    if (existingLocalRunner) {
      if (existingTokenRunner && existingTokenRunner.id !== existingLocalRunner.id) {
        throw new RunnerBootstrapTokenConflictError(existingTokenRunner.name);
      }

      const runner = await tx.agentRunner.update({
        where: { id: existingLocalRunner.id },
        data: updateRunnerData(tokenHash) as any,
        select: { id: true, name: true }
      });
      return { runner, created: false };
    }

    if (existingTokenRunner) {
      const runner = await tx.agentRunner.update({
        where: { id: existingTokenRunner.id },
        data: updateRunnerData(tokenHash) as any,
        select: { id: true, name: true }
      });
      return { runner, created: false };
    }

    const runner = await tx.agentRunner.create({
      data: createRunnerData(tokenHash) as any,
      select: { id: true, name: true }
    });
    return { runner, created: true };
  });
}

export function printRunnerBootstrapSuccess(result: RunnerBootstrapResult, logger: RunnerBootstrapLogger = console): void {
  const action = result.created ? "Created" : "Updated";
  logger.log(`[Runner Bootstrap] ${action} runner: ${result.runner.name} (${result.runner.id})`);
  logger.log("[Runner Bootstrap] Start the API: npm run dev --workspace @ai-kingdom/api");
  logger.log("[Runner Bootstrap] Start the runner with the same RUNNER_TOKEN: npm run dev --workspace @ai-kingdom/runner");
  logger.log("[Runner Bootstrap] After heartbeat, verify /automation-jobs shows Online Runners = 1.");
}
