import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExternalAgentDto, ExternalAgentReadinessReportDto, PublicUser } from "@/types/api";
import { ExternalAgentsPage } from "./ExternalAgentsPage";

const nowIso = new Date().toISOString();

function agent(id: string, name: string, type: ExternalAgentDto["type"]): ExternalAgentDto {
  return {
    id, name, type, roleTitle: "Executor", description: "", capabilities: [],
    executionMode: "API", command: "claude", workingDirectory: null, environmentProfile: null,
    isActive: true, bridgeEnabled: true, maxRuntimeSeconds: 900, requiresApproval: true,
    safetyLevel: "MEDIUM_RISK", createdAt: nowIso, updatedAt: nowIso
  } as ExternalAgentDto;
}

const apiMocks = vi.hoisted(() => ({
  externalAgents: vi.fn(),
  externalAgentReadiness: vi.fn(),
  createExternalAgent: vi.fn(),
  updateExternalAgent: vi.fn(),
  testExternalAgent: vi.fn(),
  deleteExternalAgent: vi.fn()
}));
vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser })
}));

afterEach(() => {
  vi.clearAllMocks();
  currentUser = null;
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ExternalAgentsPage />
    </MemoryRouter>
  );
}

describe("ExternalAgentsPage readiness", () => {
  it("shows Ready for an available agent and Offline+reason for an unavailable one", async () => {
    currentUser = { id: "u1", email: "king@aikingdom.local", displayName: "King", role: "KING" };
    apiMocks.externalAgents.mockResolvedValue({
      externalAgents: [agent("a1", "Claude Code", "CLAUDE_CODE"), agent("a2", "Codex", "CODEX")]
    });
    const report: ExternalAgentReadinessReportDto = {
      runnerOnline: true,
      capabilitiesUpdatedAt: nowIso,
      agents: [
        { agentId: "a1", name: "Claude Code", type: "CLAUDE_CODE", ready: true, configReady: true, runnerAvailable: true, lastRunStatus: null, reason: "ready" },
        { agentId: "a2", name: "Codex", type: "CODEX", ready: false, configReady: true, runnerAvailable: false, lastRunStatus: null, reason: "CLI not available on the runner host right now" }
      ]
    };
    apiMocks.externalAgentReadiness.mockResolvedValue(report);

    renderPage();

    await waitFor(() => expect(screen.getByText("Ready")).toBeTruthy());
    expect(screen.getByText(/CLI not available on the runner host/)).toBeTruthy();
    expect(screen.getByTestId("runner-readiness").textContent).toMatch(/Runner online/);
  });

  it("reports no online runner when readiness says so", async () => {
    currentUser = { id: "u1", email: "king@aikingdom.local", displayName: "King", role: "KING" };
    apiMocks.externalAgents.mockResolvedValue({ externalAgents: [agent("a1", "Claude Code", "CLAUDE_CODE")] });
    apiMocks.externalAgentReadiness.mockResolvedValue({
      runnerOnline: false,
      capabilitiesUpdatedAt: null,
      agents: [{ agentId: "a1", name: "Claude Code", type: "CLAUDE_CODE", ready: false, configReady: true, runnerAvailable: false, lastRunStatus: null, reason: "no online runner" }]
    } satisfies ExternalAgentReadinessReportDto);

    renderPage();

    await waitFor(() => expect(screen.getByTestId("runner-readiness").textContent).toMatch(/No online runner/));
    expect(screen.getByText(/Offline — no online runner/)).toBeTruthy();
  });
});
