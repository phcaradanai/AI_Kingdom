/**
 * In-memory store for on-demand CLI capability probes.
 *
 * Flow:
 *  1. King clicks "Run live probe" → POST /api/external-agents/:id/request-probe
 *     → requestCliProbe() stores the intent keyed by runnerId.
 *  2. Runner's next heartbeat → consumePendingProbe(runnerId) reads & clears the
 *     intent and the API includes { pendingCliProbe } in the heartbeat response.
 *  3. Runner runs the probe, sends result in the next heartbeat body.
 *  4. Heartbeat handler calls storeProbeResult() → keyed by agentId.
 *  5. Frontend polls GET /api/external-agents/:id/probe-result → getProbeResult().
 *
 * In-memory is intentional: probes are ephemeral diagnostic requests.
 * If the API restarts between request and result the King simply retries.
 */

export type CliProbeStatus =
  | "READY"
  | "NOT_INSTALLED"
  | "AGENT_CLI_DISABLED"
  | "AUTH_ERROR"
  | "CREDIT_EXHAUSTED"
  | "RATE_LIMITED"
  | "EXEC_FAILED"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";

export interface CliProbeResultDto {
  agentId: string;
  type: string;
  status: CliProbeStatus;
  output: string;
  isDeepProbe: boolean;
  checkedAt: string;
}

interface PendingProbe {
  agentId: string;
  agentType: string;
  runnerId: string;
  requestedAt: Date;
}

// One pending probe per runner at a time
const pendingByRunner = new Map<string, PendingProbe>();
// Latest result per agent
const resultsByAgent = new Map<string, CliProbeResultDto>();

export function requestCliProbe(agentId: string, agentType: string, runnerId: string): void {
  pendingByRunner.set(runnerId, { agentId, agentType, runnerId, requestedAt: new Date() });
  resultsByAgent.delete(agentId); // clear stale result so frontend can tell it's pending
}

/** Called by the heartbeat handler: returns the pending probe (if any) and removes it. */
export function consumePendingProbe(runnerId: string): { agentId: string; type: string } | null {
  const pending = pendingByRunner.get(runnerId);
  if (!pending) return null;
  // Only serve probes requested within the last 5 minutes to avoid stale requests
  if (Date.now() - pending.requestedAt.getTime() > 5 * 60 * 1000) {
    pendingByRunner.delete(runnerId);
    return null;
  }
  pendingByRunner.delete(runnerId);
  return { agentId: pending.agentId, type: pending.agentType };
}

/** Called by the heartbeat handler when the runner sends a probe result. */
export function storeProbeResult(result: CliProbeResultDto): void {
  resultsByAgent.set(result.agentId, result);
}

/** Returns the latest probe result for the agent, or null if none available. */
export function getProbeResult(agentId: string): CliProbeResultDto | null {
  return resultsByAgent.get(agentId) ?? null;
}

/** Returns true if a probe has been requested and no result is available yet. */
export function isProbeInFlight(agentId: string, runnerId: string): boolean {
  // Pending in this runner or result not yet back
  for (const pending of pendingByRunner.values()) {
    if (pending.agentId === agentId) return true;
  }
  return false;
}
