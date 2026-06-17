import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentPresenceDto, KingdomActivityItemDto, KingdomActivityStreamDto, KingdomHealthDto, KingdomPresenceDto } from "@/types/api";
import { KingdomOperationsPage } from "./KingdomOperationsPage";

const observedAt = new Date().toISOString();

const mockAgent: AgentPresenceDto = {
  id: "agent-1",
  name: "Grand Vizier",
  role: "ORCHESTRATOR",
  displayName: "Grand Vizier",
  state: "IDLE",
  currentTask: null,
  currentWorkOrder: null,
  progress: null,
  blockingReason: null,
  lastActivityAt: observedAt
};

const mockPresence: KingdomPresenceDto = {
  computedAt: observedAt,
  agents: [mockAgent]
};

const mockActivityItem: KingdomActivityItemDto = {
  id: "council:session-1",
  timestamp: observedAt,
  actor: "Grand Vizier",
  type: "COUNCIL",
  summary: "Council session completed for: Refactor auth service",
  sourceReference: { entityType: "CouncilSession", entityId: "session-1", routeTo: "/council" }
};

const mockActivity: KingdomActivityStreamDto = {
  computedAt: observedAt,
  activities: [mockActivityItem]
};

const mockHealth: KingdomHealthDto = {
  computedAt: observedAt,
  overallStatus: "HEALTHY",
  items: [
    { key: "context_health", label: "Context Health", status: "HEALTHY", reason: "All good.", recommendedAction: null, sourceReference: "/work-orders" },
    { key: "review_queue", label: "Review Queue", status: "HEALTHY", reason: "No pending reviews.", recommendedAction: null, sourceReference: "/automation-jobs" }
  ]
};

const apiMocks = vi.hoisted(() => ({
  getKingdomPresence: vi.fn(),
  getKingdomActivity: vi.fn(),
  getKingdomHealth: vi.fn()
}));

vi.mock("@/lib/api", () => ({
  api: {
    getKingdomPresence: apiMocks.getKingdomPresence,
    getKingdomActivity: apiMocks.getKingdomActivity,
    getKingdomHealth: apiMocks.getKingdomHealth
  }
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <KingdomOperationsPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("KingdomOperationsPage", () => {
  it("renders the three columns and health strip after data loads", async () => {
    apiMocks.getKingdomPresence.mockResolvedValue(mockPresence);
    apiMocks.getKingdomActivity.mockResolvedValue(mockActivity);
    apiMocks.getKingdomHealth.mockResolvedValue(mockHealth);

    renderPage();

    // Section headers
    expect(await screen.findByText("Agent Presence")).toBeInTheDocument();
    expect(screen.getByText("Current Operations")).toBeInTheDocument();
    expect(screen.getByText("Activity Stream")).toBeInTheDocument();

    // Health strip
    expect(screen.getByText("Kingdom Health")).toBeInTheDocument();
    expect(screen.getByText("Context Health")).toBeInTheDocument();
    expect(screen.getByText("Review Queue")).toBeInTheDocument();

    // Agent card (name appears in agent card and possibly activity actor)
    expect(screen.getAllByText("Grand Vizier").length).toBeGreaterThan(0);

    // Activity item
    expect(screen.getByText(mockActivityItem.summary)).toBeInTheDocument();
  });

  it("shows agent state pill with correct label", async () => {
    const runningAgent: AgentPresenceDto = {
      ...mockAgent,
      id: "agent-running",
      state: "RUNNING",
      currentTask: "Executing sandbox patch",
      currentWorkOrder: { id: "wo-1", title: "Refactor service" }
    };
    apiMocks.getKingdomPresence.mockResolvedValue({ ...mockPresence, agents: [runningAgent] });
    apiMocks.getKingdomActivity.mockResolvedValue(mockActivity);
    apiMocks.getKingdomHealth.mockResolvedValue(mockHealth);

    renderPage();

    await screen.findByText("Agent Presence");
    expect(screen.getAllByText("RUNNING").length).toBeGreaterThan(0);
    expect(screen.getByText("Executing sandbox patch")).toBeInTheDocument();
    expect(screen.getByText("Refactor service")).toBeInTheDocument();
  });

  it("refresh button triggers all three API calls again", async () => {
    apiMocks.getKingdomPresence.mockResolvedValue(mockPresence);
    apiMocks.getKingdomActivity.mockResolvedValue(mockActivity);
    apiMocks.getKingdomHealth.mockResolvedValue(mockHealth);

    renderPage();

    await screen.findByText("Agent Presence");

    const refreshBtn = screen.getByRole("button", { name: /Refresh/i });
    await userEvent.click(refreshBtn);

    await waitFor(() => {
      expect(apiMocks.getKingdomPresence).toHaveBeenCalledTimes(2);
      expect(apiMocks.getKingdomActivity).toHaveBeenCalledTimes(2);
      expect(apiMocks.getKingdomHealth).toHaveBeenCalledTimes(2);
    });
  });
});
