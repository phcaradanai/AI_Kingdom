import { prisma } from "../db/prisma.js";
import type { TaskMode } from "@prisma/client";
import { LOCAL_SANDBOX_PROVIDER_ID, LOCAL_SANDBOX_MODEL } from "./aiProviderRegistry.js";

export type RouteChainEntryDto = {
  id: string;
  chainId: string;
  sequence: number;
  providerId: string;
  model: string;
  isEnabled: boolean;
  notes: string | null;
};

export type RouteChainDto = {
  id: string;
  name: string;
  taskMode: TaskMode | null;
  agentId: string | null;
  scope: string;
  isActive: boolean;
  description: string | null;
  entries: RouteChainEntryDto[];
  createdAt: Date;
  updatedAt: Date;
};

export async function listRouteChains(): Promise<RouteChainDto[]> {
  const chains = await prisma.aIRouteChain.findMany({
    include: { entries: { orderBy: { sequence: "asc" } } },
    orderBy: { createdAt: "asc" }
  });
  return chains.map(toDto);
}

export async function getRouteChain(id: string): Promise<RouteChainDto | null> {
  const chain = await prisma.aIRouteChain.findUnique({
    where: { id },
    include: { entries: { orderBy: { sequence: "asc" } } }
  });
  return chain ? toDto(chain) : null;
}

export async function findActiveChainForContext(taskMode: TaskMode | null, agentId: string | null): Promise<RouteChainDto | null> {
  // Prefer agent-specific chain, then task-mode chain, then global
  const candidates = await prisma.aIRouteChain.findMany({
    where: { isActive: true },
    include: { entries: { orderBy: { sequence: "asc" } } }
  });

  const agentChain = agentId ? candidates.find((c) => c.agentId === agentId) : null;
  if (agentChain) return toDto(agentChain);

  const modeChain = taskMode ? candidates.find((c) => c.taskMode === taskMode && !c.agentId) : null;
  if (modeChain) return toDto(modeChain);

  const globalChain = candidates.find((c) => c.scope === "GLOBAL" && !c.taskMode && !c.agentId);
  return globalChain ? toDto(globalChain) : null;
}

export async function createRouteChain(payload: {
  name: string;
  taskMode?: TaskMode | null;
  agentId?: string | null;
  scope?: string;
  description?: string | null;
  entries: { providerId: string; model: string; isEnabled?: boolean; notes?: string | null }[];
}): Promise<RouteChainDto> {
  const chain = await prisma.aIRouteChain.create({
    data: {
      name: payload.name,
      taskMode: payload.taskMode ?? null,
      agentId: payload.agentId ?? null,
      scope: payload.scope ?? "GLOBAL",
      description: payload.description ?? null,
      entries: {
        create: ensureSandboxTerminator(payload.entries).map((e, i) => ({
          sequence: i + 1,
          providerId: e.providerId,
          model: e.model,
          isEnabled: e.isEnabled ?? true,
          notes: e.notes ?? null
        }))
      }
    },
    include: { entries: { orderBy: { sequence: "asc" } } }
  });
  return toDto(chain);
}

export async function updateRouteChain(id: string, payload: {
  name?: string;
  isActive?: boolean;
  description?: string | null;
  entries?: { providerId: string; model: string; isEnabled?: boolean; notes?: string | null }[];
}): Promise<RouteChainDto> {
  if (payload.entries !== undefined) {
    await prisma.aIRouteChainEntry.deleteMany({ where: { chainId: id } });
    const safeEntries = ensureSandboxTerminator(payload.entries);
    for (let i = 0; i < safeEntries.length; i++) {
      const e = safeEntries[i]!;
      await prisma.aIRouteChainEntry.create({
        data: { chainId: id, sequence: i + 1, providerId: e.providerId, model: e.model, isEnabled: e.isEnabled ?? true, notes: e.notes ?? null }
      });
    }
  }

  const chain = await prisma.aIRouteChain.update({
    where: { id },
    data: {
      name: payload.name,
      isActive: payload.isActive,
      description: payload.description
    },
    include: { entries: { orderBy: { sequence: "asc" } } }
  });
  return toDto(chain);
}

export async function deleteRouteChain(id: string): Promise<void> {
  await prisma.aIRouteChain.delete({ where: { id } });
}

function ensureSandboxTerminator(
  entries: { providerId: string; model: string; isEnabled?: boolean; notes?: string | null }[]
): { providerId: string; model: string; isEnabled?: boolean; notes?: string | null }[] {
  const hasSandbox = entries.some((e) => e.providerId === LOCAL_SANDBOX_PROVIDER_ID);
  if (hasSandbox) return entries;
  return [...entries, { providerId: LOCAL_SANDBOX_PROVIDER_ID, model: LOCAL_SANDBOX_MODEL, isEnabled: true, notes: "Local sandbox safety net (auto-added)" }];
}

function toDto(chain: {
  id: string; name: string; taskMode: string | null; agentId: string | null;
  scope: string; isActive: boolean; description: string | null;
  createdAt: Date; updatedAt: Date;
  entries: { id: string; chainId: string; sequence: number; providerId: string; model: string; isEnabled: boolean; notes: string | null }[];
}): RouteChainDto {
  return {
    id: chain.id,
    name: chain.name,
    taskMode: chain.taskMode as TaskMode | null,
    agentId: chain.agentId,
    scope: chain.scope,
    isActive: chain.isActive,
    description: chain.description,
    entries: chain.entries.map((e) => ({ id: e.id, chainId: e.chainId, sequence: e.sequence, providerId: e.providerId, model: e.model, isEnabled: e.isEnabled, notes: e.notes })),
    createdAt: chain.createdAt,
    updatedAt: chain.updatedAt
  };
}
