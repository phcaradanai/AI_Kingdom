import { prisma } from "../db/prisma.js";

/**
 * External-agent readiness — answers "which external agents can the King pick RIGHT
 * NOW?". Combines static config (is the agent active, bridge-enabled, with a command)
 * with the runner's live capability probe (is the CLI actually installed on the host
 * that will run it) and the agent's last run outcome. The Kingdom uses this to avoid
 * auto-picking an agent that is offline at the moment, and surfaces it so the King
 * chooses among genuinely-available agents.
 */

const ONLINE_RUNNER_MAX_HEARTBEAT_AGE_MS = 90_000;

export type ExternalAgentReadiness = {
  agentId: string;
  name: string;
  type: string;
  ready: boolean;
  configReady: boolean; // active + bridge-enabled + has command + not manual-only
  runnerAvailable: boolean; // the runner reports this CLI is present
  lastRunStatus: string | null;
  reason: string;
};

export type ExternalAgentReadinessReport = {
  runnerOnline: boolean;
  capabilitiesUpdatedAt: Date | null;
  agents: ExternalAgentReadiness[];
};

type ProbedCapability = { type?: string; available?: boolean };

function buildCapabilityMap(raw: unknown): Map<string, boolean> {
  const map = new Map<string, boolean>();
  if (Array.isArray(raw)) {
    for (const entry of raw as ProbedCapability[]) {
      if (entry && typeof entry.type === "string") map.set(entry.type.toUpperCase(), entry.available === true);
    }
  }
  return map;
}

export async function getExternalAgentReadiness(): Promise<ExternalAgentReadinessReport> {
  const cutoff = new Date(Date.now() - ONLINE_RUNNER_MAX_HEARTBEAT_AGE_MS);
  const runner = await prisma.agentRunner.findFirst({
    where: { status: "ONLINE", lastHeartbeatAt: { gte: cutoff } },
    orderBy: { lastHeartbeatAt: "desc" },
    select: { agentCapabilities: true, capabilitiesUpdatedAt: true }
  });
  const runnerOnline = runner !== null;
  const capabilityMap = buildCapabilityMap(runner?.agentCapabilities);

  const agents = await prisma.externalAgent.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, type: true, bridgeEnabled: true, command: true }
  });

  // Latest run status per agent, fetched in one query then reduced (small agent count).
  const recentRuns = await prisma.externalAgentRun.findMany({
    where: { externalAgentId: { in: agents.map((a) => a.id) } },
    orderBy: { createdAt: "desc" },
    select: { externalAgentId: true, status: true }
  });
  const lastRunByAgent = new Map<string, string>();
  for (const run of recentRuns) {
    if (!lastRunByAgent.has(run.externalAgentId)) lastRunByAgent.set(run.externalAgentId, run.status);
  }

  const result = agents.map((agent): ExternalAgentReadiness => {
    const configReady = agent.type !== "MANUAL_ONLY" && agent.bridgeEnabled && !!agent.command?.trim();
    const runnerAvailable = capabilityMap.get(agent.type.toUpperCase()) === true;
    const ready = configReady && runnerOnline && runnerAvailable;

    let reason: string;
    if (ready) reason = "ready";
    else if (agent.type === "MANUAL_ONLY") reason = "manual-only agent (not runner-executable)";
    else if (!agent.bridgeEnabled) reason = "bridge execution not enabled for this agent";
    else if (!agent.command?.trim()) reason = "no command template configured";
    else if (!runnerOnline) reason = "no online runner";
    else if (!runnerAvailable) reason = "CLI not available on the runner host right now";
    else reason = "not ready";

    return {
      agentId: agent.id,
      name: agent.name,
      type: agent.type,
      ready,
      configReady,
      runnerAvailable,
      lastRunStatus: lastRunByAgent.get(agent.id) ?? null,
      reason
    };
  });

  return { runnerOnline, capabilitiesUpdatedAt: runner?.capabilitiesUpdatedAt ?? null, agents: result };
}

export const EXTERNAL_AGENT_CHOICE_SOURCE_TYPE = "WORK_ORDER_EXTERNAL_AGENT_CHOICE";
const TERMINAL_MATTER_STATUSES = ["APPROVED", "REJECTED", "EXECUTING", "COMPLETED"] as const;

/**
 * Raise a King-decision Matter asking the King to choose an external agent for a work
 * order, listing which agents are ready right now. Idempotent per work order: a
 * non-terminal choice Matter for the same work order is reused, never duplicated.
 * Bypasses the data-value gate deliberately — this is a high-value King decision, not
 * generated content noise (same rationale as the planner's direct work-order creation).
 */
export async function requestKingExternalAgentChoice(input: {
  workOrderId: string;
  workOrderTitle: string;
  projectId: string | null;
}): Promise<{ matterId: string; created: boolean; readyAgentNames: string[] }> {
  const existing = await prisma.matter.findFirst({
    where: {
      sourceType: EXTERNAL_AGENT_CHOICE_SOURCE_TYPE,
      sourceId: input.workOrderId,
      status: { notIn: [...TERMINAL_MATTER_STATUSES] }
    }
  });

  const readiness = await getExternalAgentReadiness();
  const ready = readiness.agents.filter((a) => a.ready);
  const notReady = readiness.agents.filter((a) => !a.ready);
  const readyAgentNames = ready.map((a) => a.name);

  if (existing) {
    // Refresh the readiness snapshot on the existing Matter so the King sees current availability.
    await prisma.matter.update({
      where: { id: existing.id },
      data: { provenance: buildChoiceProvenance(input.workOrderId, ready, notReady) as object }
    }).catch(() => undefined);
    return { matterId: existing.id, created: false, readyAgentNames };
  }

  const readyLine = ready.length
    ? `Ready now: ${ready.map((a) => `${a.name} (${a.type})`).join(", ")}.`
    : "No external agent is ready right now (no online runner with the required CLI). Bring one online, then choose.";
  const notReadyLine = notReady.length
    ? ` Unavailable: ${notReady.map((a) => `${a.name} — ${a.reason}`).join("; ")}.`
    : "";

  const matter = await prisma.matter.create({
    data: {
      title: `Choose external agent for: ${input.workOrderTitle}`.slice(0, 200),
      description:
        `This work order is ready to execute but no external agent has been chosen, and the Kingdom is configured to let the King decide (REQUIRE_KING_EXTERNAL_AGENT_CHOICE). ${readyLine}${notReadyLine} Assign the work order to one of the ready agents to proceed.`,
      status: "AWAITING_ROYAL_DECISION",
      priority: "HIGH",
      category: "SYSTEM",
      sourceType: EXTERNAL_AGENT_CHOICE_SOURCE_TYPE,
      sourceId: input.workOrderId,
      projectId: input.projectId ?? undefined,
      createdBySystem: true,
      dataSource: EXTERNAL_AGENT_CHOICE_SOURCE_TYPE,
      provenance: buildChoiceProvenance(input.workOrderId, ready, notReady) as object
    }
  });
  return { matterId: matter.id, created: true, readyAgentNames };
}

/**
 * Close any open external-agent-choice Matter for a work order — called when the King
 * has made the decision (assigned an agent or a bridge job was created for it), so the
 * decision no longer sits in the King's queue. Idempotent; safe to call from any path.
 */
export async function resolveExternalAgentChoiceMatter(workOrderId: string): Promise<number> {
  const { count } = await prisma.matter.updateMany({
    where: {
      sourceType: EXTERNAL_AGENT_CHOICE_SOURCE_TYPE,
      sourceId: workOrderId,
      status: { notIn: [...TERMINAL_MATTER_STATUSES] }
    },
    data: { status: "COMPLETED" }
  });
  return count;
}

function buildChoiceProvenance(workOrderId: string, ready: ExternalAgentReadiness[], notReady: ExternalAgentReadiness[]) {
  return {
    reason: "external_agent_choice_required",
    workOrderId,
    readyAgents: ready.map((a) => ({ agentId: a.agentId, name: a.name, type: a.type })),
    unavailableAgents: notReady.map((a) => ({ agentId: a.agentId, name: a.name, type: a.type, reason: a.reason }))
  };
}
