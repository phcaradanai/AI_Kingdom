import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextActionItem, NextActionQueueDto, PublicUser, RoyalBriefDto, SecretaryBriefDto, WorkOrderDto } from "@/types/api";
import { DashboardPage } from "./DashboardPage";

const observedAt = new Date().toISOString();

const topAction: NextActionItem = {
  id: "WorkOrder:wo-1",
  entityType: "WorkOrder",
  entityId: "wo-1",
  title: "Work order awaiting review: Dashboard command center",
  actionLabel: "Review Work Order",
  why: "Work order is in NEEDS_REVIEW with priority HIGH.",
  priority: 84,
  riskLevel: "HIGH",
  abstractState: "AWAITING_DECISION",
  isEscalated: false,
  isBlocking: 0,
  routeTo: "/work-orders",
  ageHours: 4,
  provenance: { source: "WorkOrder", id: "wo-1", observedAt }
};

const nextActions: NextActionQueueDto = {
  computedAt: observedAt,
  topAction,
  queue: [topAction],
  summary: {
    totalPending: 1,
    criticalCount: 0,
    highCount: 1,
    blockedCount: 0,
    escalatedCount: 0
  }
};

const royalBrief: RoyalBriefDto = {
  id: "brief-1",
  title: "Daily Royal Brief",
  briefDate: observedAt,
  status: "READY",
  summary: "The Kingdom has one decision and one patch awaiting review.",
  highlights: { items: [] },
  decisionsNeeded: {
    items: [{
      id: "decision-1",
      title: "Decide whether to approve the dashboard patch",
      why: "A work order is waiting for King review.",
      sourceLink: "/work-orders",
      riskLevel: "HIGH",
      recommendedAction: "Review",
      availableActions: ["Review"],
      provenance: { source: "WorkOrder", id: "wo-1", observedAt }
    }]
  },
  runnerStatus: { onlineCount: 1, offlineCount: 0, staleCount: 0, errorCount: 0, runners: [] },
  livingLoopSummary: {},
  validationSummary: { jobsFailed: 0 },
  patchSummary: { patchesNeedingReview: [{ id: "patch-1" }] },
  providerSummary: { recentErrorCounts: [] },
  treasurySummary: {},
  memorySummary: {},
  riskSummary: {},
  localDocsSummary: {},
  livingAgentDigest: { items: [] },
  provenance: {},
  generatedBy: "SYSTEM",
  generatedByUserId: null,
  createdAt: observedAt,
  updatedAt: observedAt
};

const secretaryBrief: SecretaryBriefDto = {
  kingdomStatus: {
    unreadNotices: 2,
    criticalNotices: 1,
    openMatters: 3,
    criticalMatters: 1,
    awaitingRoyalDecision: 1,
    failedTasks: 0,
    budgetWarning: false
  },
  urgentNotices: [],
  openMatters: [],
  awaitingRoyalDecision: [],
  recommendedActions: [],
  charter: { mission: "Build the Kingdom with auditable systems." },
  vision: null
};

const apiMocks = vi.hoisted(() => ({
  secretaryBrief: vi.fn(),
  workOrders: vi.fn(),
  handoffBriefs: vi.fn(),
  projects: vi.fn(),
  projectInbox: vi.fn(),
  getCurrentAgentActivities: vi.fn(),
  getNextActions: vi.fn(),
  latestRoyalBrief: vi.fn(),
  generateRoyalBrief: vi.fn(),
  livingLoopStatus: vi.fn(),
  runLivingLoopOnce: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser })
}));

vi.mock("@/stores/kingdomStore", () => ({
  useKingdomStore: () => ({
    agents: [],
    tasks: [],
    reports: [],
    memories: []
  })
}));

function setUser(role: PublicUser["role"] = "MINISTER") {
  currentUser = { id: "user-1", email: `${role.toLowerCase()}@aikingdom.local`, displayName: role, role };
}

function resetApiMocks() {
  apiMocks.secretaryBrief.mockResolvedValue(secretaryBrief);
  apiMocks.workOrders.mockResolvedValue({
    workOrders: [
      { id: "wo-1", status: "NEEDS_REVIEW", title: "Review dashboard command center" } as WorkOrderDto,
      { id: "wo-2", status: "READY", title: "Prepare source links" } as WorkOrderDto
    ],
    hiddenCount: 0
  });
  apiMocks.handoffBriefs.mockResolvedValue({ handoffBriefs: [] });
  apiMocks.projects.mockResolvedValue({ projects: [] });
  apiMocks.projectInbox.mockResolvedValue({ inboxItems: [] });
  apiMocks.getCurrentAgentActivities.mockResolvedValue({ activities: [] });
  apiMocks.getNextActions.mockResolvedValue(nextActions);
  apiMocks.latestRoyalBrief.mockResolvedValue({ brief: royalBrief });
  apiMocks.generateRoyalBrief.mockResolvedValue({ brief: royalBrief });
  apiMocks.livingLoopStatus.mockResolvedValue({ status: { pendingCandidates: 0 } });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  currentUser = null;
});

describe("DashboardPage", () => {
  it("renders the command center and keeps Issue Royal Decree linked", async () => {
    setUser();
    resetApiMocks();

    renderPage();

    expect(await screen.findByText("The Kingdom at a Glance")).toBeInTheDocument();
    expect(screen.getByText("What should the King do next?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Issue Royal Decree/i })).toHaveAttribute("href", "/throne-room");
  });

  it("renders Royal Brief metrics with review links", async () => {
    setUser();
    resetApiMocks();

    renderPage();

    expect(await screen.findByText("Decisions Needed")).toBeInTheDocument();
    expect(screen.getByText("Patches Needing Review")).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links.some((link) => link.textContent?.includes("Decisions Needed") && link.getAttribute("href") === "/inbox")).toBe(true);
    expect(links.some((link) => link.textContent?.includes("Patches Needing Review") && link.getAttribute("href") === "/automation-jobs")).toBe(true);
  });

  it("links Work Orders and Automation metrics to their source pages", async () => {
    setUser();
    resetApiMocks();

    renderPage();

    expect(await screen.findByText("External Work")).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links.some((link) => link.textContent?.includes("Needs Review") && link.getAttribute("href") === "/work-orders")).toBe(true);
    expect(links.some((link) => link.getAttribute("href") === "/automation-jobs")).toBe(true);
  });

  it("shows an empty next-action state without crashing", async () => {
    setUser();
    resetApiMocks();
    apiMocks.getNextActions.mockResolvedValue({ ...nextActions, topAction: null, queue: [] });
    apiMocks.latestRoyalBrief.mockResolvedValue({ brief: { ...royalBrief, decisionsNeeded: { items: [] } } });

    renderPage();

    expect(await screen.findByText("No urgent command pending")).toBeInTheDocument();
    expect(screen.getByText("Daily Royal Brief")).toBeInTheDocument();
  });

  it("shows a next-action error fallback without crashing", async () => {
    setUser();
    resetApiMocks();
    apiMocks.getNextActions.mockRejectedValue(new Error("Inbox unavailable"));

    renderPage();

    expect(await screen.findByText("Kingdom Inbox is temporarily unavailable. Showing the Royal Brief fallback.")).toBeInTheDocument();
    expect(screen.getByText("Decide whether to approve the dashboard patch")).toBeInTheDocument();
  });
});
