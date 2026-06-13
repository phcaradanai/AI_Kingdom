import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const WORKSPACE_PREPARATION_FAILURE =
  "Runner workspace preparation failed: RUNNER_REPO_PATH missing or package.json not found";

const DEFAULT_WORKSPACE_BASE = path.join(os.tmpdir(), "ai-kingdom-runner");
const EXCLUDED_PATH_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "tmp"
]);

export interface PrepareRunnerWorkspaceOptions {
  jobId: string;
  env?: NodeJS.ProcessEnv;
  workspaceBase?: string;
  initializeGitBaseline?: boolean;
}

export interface PreparedRunnerWorkspace {
  sourceRepoPath: string;
  workspaceBase: string;
  workspaceDir: string;
}

export function getRunnerWorkspaceBase(env: NodeJS.ProcessEnv = process.env): string {
  return env.RUNNER_WORKSPACE_BASE ?? env.WORKSPACE_BASE ?? DEFAULT_WORKSPACE_BASE;
}

export function getRunnerJobWorkspaceDir(jobId: string, workspaceBase: string): string {
  const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, "_") || "job";
  return path.join(workspaceBase, "jobs", safeJobId);
}

export function validateRunnerRepoPath(env: NodeJS.ProcessEnv = process.env): string {
  const repoPath = env.RUNNER_REPO_PATH?.trim();
  if (!repoPath) throw new Error(WORKSPACE_PREPARATION_FAILURE);

  const resolved = path.resolve(repoPath);
  const packageJsonPath = path.join(resolved, "package.json");
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(WORKSPACE_PREPARATION_FAILURE);
  }
  if (!fs.existsSync(packageJsonPath) || !fs.statSync(packageJsonPath).isFile()) {
    throw new Error(WORKSPACE_PREPARATION_FAILURE);
  }
  return resolved;
}

export function shouldCopyRunnerPath(sourceRoot: string, candidatePath: string): boolean {
  const relative = path.relative(sourceRoot, candidatePath);
  if (!relative) return true;
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;

  const segments = relative.split(path.sep).filter(Boolean);
  return !segments.some((segment) =>
    EXCLUDED_PATH_SEGMENTS.has(segment) || segment === ".env" || segment.startsWith(".env.")
  );
}

export function prepareRunnerWorkspace(opts: PrepareRunnerWorkspaceOptions): PreparedRunnerWorkspace {
  const env = opts.env ?? process.env;
  const sourceRepoPath = validateRunnerRepoPath(env);
  const workspaceBase = path.resolve(opts.workspaceBase ?? getRunnerWorkspaceBase(env));
  const workspaceDir = getRunnerJobWorkspaceDir(opts.jobId, workspaceBase);

  fs.rmSync(workspaceDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(workspaceDir), { recursive: true });
  fs.cpSync(sourceRepoPath, workspaceDir, {
    recursive: true,
    dereference: false,
    filter: (src) => shouldCopyRunnerPath(sourceRepoPath, src) && !fs.lstatSync(src).isSymbolicLink()
  });

  if (opts.initializeGitBaseline ?? true) {
    initializeLocalGitBaseline(workspaceDir);
  }

  return { sourceRepoPath, workspaceBase, workspaceDir };
}

function initializeLocalGitBaseline(workspaceDir: string): void {
  const init = spawnSync("git", ["init"], { cwd: workspaceDir, encoding: "utf8" });
  if (init.status !== 0) return;

  const add = spawnSync("git", ["add", "."], { cwd: workspaceDir, encoding: "utf8" });
  if (add.status !== 0) return;

  spawnSync(
    "git",
    [
      "-c",
      "user.name=AI Kingdom Runner",
      "-c",
      "user.email=runner@localhost",
      "commit",
      "-m",
      "runner workspace baseline"
    ],
    { cwd: workspaceDir, encoding: "utf8" }
  );
}
