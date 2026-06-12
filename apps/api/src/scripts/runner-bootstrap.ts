import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  bootstrapLocalRunner,
  printRunnerBootstrapSuccess,
  RunnerBootstrapMissingTokenError,
  RunnerBootstrapTokenConflictError
} from "../services/runnerBootstrapService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../../..");

export function loadRootEnv(): void {
  dotenv.config({ path: path.join(rootDir, ".env") });
}

export async function runRunnerBootstrapCommand(): Promise<number> {
  loadRootEnv();
  const prisma = new PrismaClient();

  try {
    const result = await bootstrapLocalRunner({
      prisma,
      runnerToken: process.env.RUNNER_TOKEN,
      requireToken: true
    });

    if (result) {
      printRunnerBootstrapSuccess(result);
    }
    return 0;
  } catch (error) {
    if (error instanceof RunnerBootstrapMissingTokenError || error instanceof RunnerBootstrapTokenConflictError) {
      console.error(`[Runner Bootstrap] ${error.message}`);
      return 1;
    }
    console.error("[Runner Bootstrap] Failed to bootstrap Local Runner.");
    console.error(error);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;

if (isDirectRun) {
  runRunnerBootstrapCommand()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error("[Runner Bootstrap] Failed to bootstrap Local Runner.");
      console.error(error);
      process.exitCode = 1;
    });
}
