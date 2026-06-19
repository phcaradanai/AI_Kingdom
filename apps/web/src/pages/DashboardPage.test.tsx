import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KingdomActivityStreamDto, KingdomHealthDto, MissionControlDto, NextActionItem, NextActionQueueDto, PublicUser, WorkOrderDto } from "@/types/api";
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
  summary: { totalPending: 1, criticalCount: 0, highCount: 1, blockedCount: 0, escalatedCount: 0 }
};

const health: KingdomHealthDto = {
  computedAt: observedAt,
  overallStatus: "WARNING",
  items: [
    { key: "providers", label: "Providers", status: "WARNING", reason: "1 provider degraded", recommendedAction: "Check providers", sourceReference: "/providers" },
    { key: "runners", label: "Runners", status: "HEALTHY", reason: "1 runner online", recommendedAction: null, sourceReference: "/automation-jobs" }
  ]
};

const activity: KingdomActivityStreamDto = {
  computedAt: observedAt,
  activities: [
    {
      id: "act-1",
      timestamp: observedAt,
      actor: "Royal Planner",
      type: "WORK_ORDER",
      summary: "Work order created from project inbox",
      sourceReference: { entityType: "WorkOrder", entityId: "wo-1", routeTo: "/work-orders" }
    }
  ]
};

const missionControl: MissionControlDto = {
  computedAt: observedAt,
  milestoneCodename: "KINGDOM_MISSION_CONTROL_FOUNDATION",
  topAction: {
    id: "ready-work-order:wo-2",
    priority: 4,
    priorityKey: "WORK_ORDER_READY_TO_DISPATCH",
    severity: "WARNING",
    title: "Work Order ready to dispatch: Prepare source links",
    detail: "Create or send the handoff brief.",
    nextAction: "Create or send the handoff brief.",
    routeTo: "/work-orders",
    sourceReference: { sourceType: "WorkOrder", sourceId: "wo-2", routeTo: "/work-orders", workOrderId: "wo-2" }
  },
  actionQueue: [
    {
      id: "ready-work-order:wo-2",
      priority: 4,
      priorityKey: "WORK_ORDER_READY_TO_DISPATCH",
      severity: "WARNING",
      title: "Work Order ready to dispatch: Prepare source links",
      detail: "Create or send the handoff brief.",
      nextAction: "Create or send the handoff brief.",
      routeTo: "/work-orders",
      sourceReference: { sourceType: "WorkOrder", sourceId: "wo-2", sourceTitle: "Prepare source links", sourceRoute: "/work-orders", routeTo: "/work-orders", updatedAt: observedAt, recommendedAction: "Create or send the handoff brief.", why: "Work Order is READY.", workOrderId: "wo-2" }
    }
  ],
  activeWorkOrders: [
    {
      id: "wo-2",
      title: "Prepare source links",
      priority: "HIGH",
      status: "READY",
      lifecycleState: "DISPATCH_READY",
      displayState: "Ready",
      assignedAgent: { id: "agent-1", name: "Royal Planner", title: "Planner" },
      assignedExternalAgent: null,
      relatedAutomationJobId: null,
      relatedReviewSummaryId: null,
      blockedReason: null,
      contextBindingStatus: "FRESH",
      lastUpdated: observedAt,
      nextAction: "Create or send the handoff brief.",
      sourceReference: { sourceType: "WorkOrder", sourceId: "wo-2", sourceTitle: "Prepare source links", sourceRoute: "/work-orders", routeTo: "/work-orders", updatedAt: observedAt, recommendedAction: "Create or send the handoff brief.", why: "Work Order is READY.", workOrderId: "wo-2" }
    }
  ],
  activeWork: [
    {
      id: "wo-2",
      title: "Prepare source links",
      priority: "HIGH",
      status: "READY",
      lifecycleState: "DISPATCH_READY",
      displayState: "Ready",
      assignedAgent: { id: "agent-1", name: "Royal Planner", title: "Planner" },
      assignedExternalAgent: null,
      relatedAutomationJobId: null,
      relatedReviewSummaryId: null,
      blockedReason: null,
      contextBindingStatus: "FRESH",
      lastUpdated: observedAt,
      nextAction: "Create or send the handoff brief.",
      sourceReference: { sourceType: "WorkOrder", sourceId: "wo-2", sourceTitle: "Prepare source links", sourceRoute: "/work-orders", routeTo: "/work-orders", updatedAt: observedAt, recommendedAction: "Create or send the handoff brief.", why: "Work Order is READY.", workOrderId: "wo-2" }
    }
  ],
  blockedWorkOrders: [],
  blockedItems: [],
  needsReviewItems: [],
  runningJobs: [],
  recentAgentActivity: [
    {
      id: "activity-1",
      agentId: "agent-1",
      agentName: "Royal Planner",
      role: "Planner",
      currentState: "Thinking",
      relatedWorkOrderId: "wo-2",
      relatedAutomationJobId: null,
      relatedReviewSummaryId: null,
      title: "Planning Work Order",
      detail: null,
      lastUpdated: observedAt,
      nextAction: "Monitor activity from its source page.",
      sourceReference: { sourceType: "WorkOrder", sourceId: "wo-2", sourceTitle: "Prepare source links", sourceRoute: "/work-orders", routeTo: "/work-orders", updatedAt: observedAt, recommendedAction: "Monitor activity from its source page.", why: "Agent activity status is IN_PROGRESS.", workOrderId: "wo-2", agentId: "agent-1" }
    }
  ],
  recentActivity: [
    {
      id: "activity-1",
      agentId: "agent-1",
      agentName: "Royal Planner",
      role: "Planner",
      currentState: "Thinking",
      relatedWorkOrderId: "wo-2",
      relatedAutomationJobId: null,
      relatedReviewSummaryId: null,
      title: "Planning Work Order",
      detail: null,
      lastUpdated: observedAt,
      nextAction: "Monitor activity from its source page.",
      sourceReference: { sourceType: "WorkOrder", sourceId: "wo-2", sourceTitle: "Prepare source links", sourceRoute: "/work-orders", routeTo: "/work-orders", updatedAt: observedAt, recommendedAction: "Monitor activity from its source page.", why: "Agent activity status is IN_PROGRESS.", workOrderId: "wo-2", agentId: "agent-1" }
    }
  ],
  staleContextWarnings: [],
  contextWarnings: [],
  providerRoutingWarnings: [],
  providerWarnings: [],
  nextRecommendedAction: "Create or send the handoff brief.",
  migration: {
    required: false,
    reason: "No Prisma migration was added."
  }
};

const apiMocks = vi.hoisted(() => ({
  getMissionControl: vi.fn(),
  getNextActions: vi.fn(),
  getKingdomHealth: vi.fn(),
  getKingdomActivity: vi.fn(),
  workOrders: vi.fn(),
  projects: vi.fn(),
  secretaryBrief: vi.fn(),
  livingLoopStatus: vi.fn(),
  runLivingLoopOnce: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser })
}));

function setUser(role: PublicUser["role"] = "MINISTER") {
  currentUser = { id: "user-1", email: `${role.toLowerCase()}@aikingdom.local`, displayName: role, role };
}

function resetApiMocks() {
  apiMocks.getMissionControl.mockResolvedValue(missionControl);
  apiMocks.getNextActions.mockResolvedValue(nextActions);
  apiMocks.getKingdomHealth.mockResolvedValue(health);
  apiMocks.getKingdomActivity.mockResolvedValue(activity);
  apiMocks.workOrders.mockResolvedValue({
    workOrders: [
      { id: "wo-1", status: "NEEDS_REVIEW", title: "Review dashboard command center" } as WorkOrderDto,
      { id: "wo-2", status: "READY", title: "Prepare source links" } as WorkOrderDto
    ],
    hiddenCount: 0
  });
  apiMocks.projects.mockResolvedValue({ projects: [] });
  apiMocks.secretaryBrief.mockResolvedValue({
    kingdomStatus: {
      unreadNotices: 0, criticalNotices: 0, openMatters: 0, criticalMatters: 0,
      awaitingRoyalDecision: 0, failedTasks: 0, workOrdersAwaitingReview: 1, budgetWarning: false
    },
    urgentNotices: [], openMatters: [], awaitingRoyalDecision: [],
    recentAgentReports: [], recommendedActions: [], charter: null, vision: null
  });
  apiMocks.livingLoopStatus.mockResolvedValue({ status: { pendingCandidates: 0 } });
  apiMocks.runLivingLoopOnce.mockResolvedValue({});
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
  it("renders Mission Control top recommended action", async () => {
    setUser();
    resetApiMocks();

    renderPage();

    expect((await screen.findAllByText("Mission Control")).length).toBeGreaterThan(0);
    expect(screen.getByText("What should the King do next?")).toBeInTheDocument();
    expect(screen.getAllByText("Work Order ready to dispatch: Prepare source links").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Open source" }).some((link) => link.getAttribute("href") === "/work-orders")).toBe(true);
    expect(screen.getAllByText("Royal Planner").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Action Queue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active Work").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Needs Review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Blocked / Warnings").length).toBeGreaterThan(0);
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
  });

  it("renders the Action Queue with source links", async () => {
    setUser();
    resetApiMocks();

    renderPage();

    expect((await screen.findAllByText("Mission Control")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create or send the handoff brief.").length).toBeGreaterThan(0);

    const provenanceLink = screen.getAllByRole("link", { name: /WorkOrder #wo-2/i })[0];
    expect(provenanceLink).toHaveAttribute("href", "/work-orders");
  });

  it("keeps Issue Royal Decree linked for command roles and hides it otherwise", async () => {
    setUser("MINISTER");
    resetApiMocks();
    const { unmount } = renderPage();
    expect(await screen.findByRole("link", { name: /Issue Royal Decree/i })).toHaveAttribute("href", "/throne-room?view=command");
    unmount();

    setUser("SCRIBE");
    resetApiMocks();
    renderPage();
    await screen.findAllByText("Action Queue");
    expect(screen.queryByRole("link", { name: /Issue Royal Decree/i })).toBeNull();
  });

  it("renders the Kingdom Health strip with source-linked pills", async () => {
    setUser();
    resetApiMocks();

    renderPage();

    expect(await screen.findByText("Kingdom Health")).toBeInTheDocument();
    const providerPill = screen.getByRole("link", { name: /Providers/i });
    expect(providerPill).toHaveAttribute("href", "/providers");
  });

  it("renders Active Work from mission control work orders", async () => {
    setUser();
    resetApiMocks();

    renderPage();

    expect((await screen.findAllByText("Active Work")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Prepare source links").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Source: WorkOrder").length).toBeGreaterThan(0);
  });

  it("renders Recent Activity linking each row to its source", async () => {
    setUser();
    resetApiMocks();

    renderPage();

    expect(await screen.findByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("Planning Work Order")).toBeInTheDocument();
    expect(screen.getByText("Work order created from project inbox")).toBeInTheDocument();
  });

  it("shows an empty Action Queue state without crashing", async () => {
    setUser();
    resetApiMocks();
    apiMocks.getMissionControl.mockResolvedValue({ ...missionControl, actionQueue: [] });

    renderPage();

    expect(await screen.findByText("No queued actions")).toBeInTheDocument();
  });
});
