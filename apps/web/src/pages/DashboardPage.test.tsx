import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KingdomActivityStreamDto, KingdomHealthDto, NextActionItem, NextActionQueueDto, PublicUser, WorkOrderDto } from "@/types/api";
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

const apiMocks = vi.hoisted(() => ({
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
  it("renders Top Actions with the action and its provenance source", async () => {
    setUser();
    resetApiMocks();

    renderPage();

    expect(await screen.findByText("The Kingdom at a Glance")).toBeInTheDocument();
    expect(screen.getByText("Top Actions")).toBeInTheDocument();
    expect(screen.getByText(topAction.title)).toBeInTheDocument();
    expect(screen.getByText(topAction.why)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review Work Order/i })).toBeInTheDocument();

    // Provenance: every Top Action card answers "where did this come from?"
    const provenanceLink = screen.getByRole("link", { name: /WorkOrder #wo-1/i });
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
    await screen.findByText("Top Actions");
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

  it("renders Active Initiatives from open work orders", async () => {
    setUser();
    resetApiMocks();

    renderPage();

    expect(await screen.findByText("Active Initiatives")).toBeInTheDocument();
    expect(screen.getByText("Review dashboard command center")).toBeInTheDocument();
    expect(screen.getByText("Prepare source links")).toBeInTheDocument();
    // Blocker derived from status, not a dedicated field
    expect(screen.getByText("Awaiting your review")).toBeInTheDocument();
  });

  it("renders Recent Activity linking each row to its source", async () => {
    setUser();
    resetApiMocks();

    renderPage();

    expect(await screen.findByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("Work order created from project inbox")).toBeInTheDocument();
  });

  it("shows an empty Top Actions state without crashing", async () => {
    setUser();
    resetApiMocks();
    apiMocks.getNextActions.mockResolvedValue({ ...nextActions, topAction: null, queue: [] });

    renderPage();

    expect(await screen.findByText("No urgent command pending")).toBeInTheDocument();
  });
});
