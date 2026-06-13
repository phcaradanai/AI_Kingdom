/**
 * Shared runner configuration.
 *
 * RUNNER_COMMAND_TIMEOUT_MS is the single timeout applied to every child
 * process the runner spawns (dependency install, pre-validation, and all
 * validation commands). Per-command timeout envs are not supported.
 */

export const DEFAULT_RUNNER_COMMAND_TIMEOUT_MS = 600_000; // 10 minutes

export function getCommandTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.RUNNER_COMMAND_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RUNNER_COMMAND_TIMEOUT_MS;
}

export function formatTimeoutMessage(timeoutMs: number): string {
  return `Command timed out after RUNNER_COMMAND_TIMEOUT_MS (${timeoutMs}ms)`;
}
