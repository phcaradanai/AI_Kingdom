import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextActionItem, NextActionQueueDto, PublicUser } from "@/types/api";
import { InboxPage } from "./InboxPage";

const observedAt = new Date().toISOString();

const mockTopAction: NextActionItem = {
  id: "WorkOrder:wo-1",
  entityType: "WorkOrder",
  entityId: "wo-1",
  title: "Work order awaiting review: Refactor auth service",
  actionLabel: "Review & Decide",
  why: "Work order is in NEEDS_REVIEW with priority CRITICAL.",
  priority: 92,
  riskLevel: "CRITICAL",
  abstractState: "AWAITING_DECISION",
  isEscalated: true,
  isBlocking: 0,
  routeTo: "/work-orders",
  ageHours: 26,
  provenance: { source: "WorkOrder", id: "wo-1", observedAt }
};

const mockQueueItem: NextActionItem = {
  id: "AutomationJob:job-1",
  entityType: "AutomationJob",
  entityId: "job-1",
  title: "Automation job needs approval: Sandbox patch for order queue",
  actionLabel: "Approve Job",
  why: "SANDBOX_PATCH job is QUEUED and awaiting King approval.",
  priority: 78,
  riskLevel: "HIGH",
  abstractState: "AWAITING_ACTION",
  isEscalated: false,
  isBlocking: 0,
  routeTo: "/automation-jobs",
  ageHours: 3,
  provenance: { source: "AutomationJob", id: "job-1", observedAt }
};

const mockQueueDto: NextActionQueueDto = {
  computedAt: observedAt,
  topAction: mockTopAction,
  queue: [mockTopAction, mockQueueItem],
  summary: {
    totalPending: 2,
    criticalCount: 1,
    highCount: 3,
    blockedCount: 0,
    escalatedCount: 1
  }
};

const emptyQueueDto: NextActionQueueDto = {
  computedAt: observedAt,
  topAction: null,
  queue: [],
  summary: { totalPending: 0, criticalCount: 0, highCount: 0, blockedCount: 0, escalatedCount: 0 }
};

const apiMocks = vi.hoisted(() => ({
  getNextActions: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser })
}));

function setUser(role: PublicUser["role"]) {
  currentUser = { id: "user-1", email: `${role.toLowerCase()}@aikingdom.local`, displayName: role, role };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InboxPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  currentUser = null;
});

describe("InboxPage", () => {
  it("renders the top priority action with title and action label", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    // title appears in both TopActionCard (h3) and queue list (h4)
    expect((await screen.findAllByText(mockTopAction.title)).length).toBeGreaterThan(0);
    // actionLabel appears in both TopActionCard and queue item (same item in queue)
    expect(screen.getAllByRole("button", { name: /Review & Decide/ }).length).toBeGreaterThan(0);
  });

  it("renders the full action queue with all items", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    expect(await screen.findByText(mockQueueItem.title)).toBeInTheDocument();
    expect(screen.getByText(/Approve Job/)).toBeInTheDocument();
  });

  it("shows summary stats including critical and high counts", async () => {
    setUser("CROWN_PRINCE");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    // Wait for page to load
    await screen.findByText("Top Priority Action");
    // criticalCount=1, highCount=3 — rendered as StatCard values
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getAllByText("CRITICAL").length).toBeGreaterThan(0);
  });

  it("shows empty state when there are no pending actions", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(emptyQueueDto);

    renderPage();

    expect(await screen.findByText("No pending royal actions")).toBeInTheDocument();
  });

  it("refresh button triggers another getNextActions call", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    await screen.findByText("Top Priority Action");
    const refreshButton = screen.getByRole("button", { name: /Refresh/ });
    await userEvent.click(refreshButton);

    await waitFor(() => expect(apiMocks.getNextActions).toHaveBeenCalledTimes(2));
  });

  it("top action button links to routeTo path", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    await screen.findByText("Top Priority Action");
    const links = screen.getAllByRole("link");
    const workOrderLink = links.find(l => l.getAttribute("href") === "/work-orders");
    expect(workOrderLink).toBeDefined();
  });

  it("queue item action button links to its routeTo path", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    await screen.findByText(mockQueueItem.title);
    const links = screen.getAllByRole("link");
    const jobLink = links.find(l => l.getAttribute("href") === "/automation-jobs");
    expect(jobLink).toBeDefined();
  });

  it("shows escalated badge on escalated items", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    await screen.findByText("Top Priority Action");
    expect(screen.getAllByText(/Escalated/i).length).toBeGreaterThan(0);
  });
});
