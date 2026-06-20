import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "@/components/layout/AppLayout";
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

const mockBlockedItem: NextActionItem = {
  id: "PatchArtifact:patch-1",
  entityType: "PatchArtifact",
  entityId: "patch-1",
  title: "Patch review blocked by failed validation",
  actionLabel: "Review Patch",
  why: "Patch validation failed and blocks the implementation path.",
  priority: 66,
  riskLevel: "MEDIUM",
  abstractState: "BLOCKED",
  isEscalated: false,
  isBlocking: 1,
  routeTo: "/automation-jobs",
  ageHours: 9,
  provenance: { source: "PatchArtifact", id: "patch-1", observedAt }
};

const mockQueueDto: NextActionQueueDto = {
  computedAt: observedAt,
  topAction: mockTopAction,
  queue: [mockTopAction, mockQueueItem, mockBlockedItem],
  summary: {
    totalPending: 3,
    criticalCount: 1,
    highCount: 1,
    blockedCount: 1,
    escalatedCount: 1
  }
};

const emptyQueueDto: NextActionQueueDto = {
  computedAt: observedAt,
  topAction: null,
  queue: [],
  summary: { totalPending: 0, criticalCount: 0, highCount: 0, blockedCount: 0, escalatedCount: 0 }
};

const mockContextItem: NextActionItem = {
  id: "WorkOrder:ctx:wo-ctx-1",
  entityType: "WorkOrder",
  entityId: "wo-ctx-1",
  title: "Work order blocked by STALE context: Deploy service",
  actionLabel: "Bind Context",
  why: "Work order has STALE context binding. Bind or refresh before patching.",
  priority: 45,
  riskLevel: "LOW",
  abstractState: "BLOCKED",
  isEscalated: false,
  isBlocking: 0,
  routeTo: "/work-orders",
  ageHours: 2,
  provenance: { source: "WorkOrder", id: "wo-ctx-1", observedAt }
};

const apiMocks = vi.hoisted(() => ({
  getNextActions: vi.fn(),
  refreshWorkOrderContext: vi.fn()
}));

vi.mock("@/lib/api", () => ({
  api: {
    getNextActions: apiMocks.getNextActions,
    refreshWorkOrderContext: apiMocks.refreshWorkOrderContext
  }
}));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser })
}));

const refreshStore = vi.fn();
vi.mock("@/stores/kingdomStore", () => ({
  useKingdomStore: (selector: (state: { refresh: () => Promise<void> }) => unknown) => selector({ refresh: refreshStore })
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

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>Dashboard outlet</div>} />
        </Route>
      </Routes>
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
    expect(screen.getByText("Recommended Action")).toBeInTheDocument();
  });

  it("groups the full action queue by risk", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    expect(await screen.findByText(mockQueueItem.title)).toBeInTheDocument();
    expect(screen.getByText(mockBlockedItem.title)).toBeInTheDocument();
    expect(screen.getByText("Act now")).toBeInTheDocument();
    expect(screen.getByText("Review soon")).toBeInTheDocument();
    expect(screen.getByText("Keep moving")).toBeInTheDocument();
  });

  it("shows summary stats including critical and high counts", async () => {
    setUser("CROWN_PRINCE");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    // Wait for page to load
    await screen.findByText("Top Action");
    // totalPending=3, criticalCount=1, highCount=1, blockedCount=1
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getAllByText("CRITICAL").length).toBeGreaterThan(0);
  });

  it("shows empty state when there are no pending actions", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(emptyQueueDto);

    renderPage();

    expect(await screen.findByText("No pending royal actions.")).toBeInTheDocument();
  });

  it("shows an error state with retry when the API fails", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockRejectedValueOnce(new Error("Next actions unavailable"));

    renderPage();

    expect(await screen.findByText("Unable to load Kingdom Inbox.")).toBeInTheDocument();
    expect(screen.getByText("Next actions unavailable")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Retry/i }).length).toBeGreaterThan(0);
  });

  it("refresh button triggers another getNextActions call", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    await screen.findByText("Top Action");
    const refreshButton = screen.getByRole("button", { name: /Refresh/ });
    await userEvent.click(refreshButton);

    await waitFor(() => expect(apiMocks.getNextActions).toHaveBeenCalledTimes(2));
    expect(apiMocks.getNextActions).toHaveBeenCalledWith({ limit: 100 });
  });

  it("top action button links to routeTo path", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    await screen.findByText("Top Action");
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

    await screen.findByText("Top Action");
    expect(screen.getAllByText(/Escalated/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Blocking/i).length).toBeGreaterThan(0);
  });

  it("filters by risk and blocked-only state", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    await screen.findByText("Top Action");
    await userEvent.selectOptions(screen.getByLabelText("Risk"), "MEDIUM");
    expect(screen.getByText(mockBlockedItem.title)).toBeInTheDocument();
    expect(screen.queryByText(mockQueueItem.title)).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Blocked only"));
    expect(screen.getByText(mockBlockedItem.title)).toBeInTheDocument();
  });

  it("renders source-of-truth references", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderPage();

    await screen.findByText("Source of Truth References");
    const links = screen.getAllByRole("link");
    expect(links.some((link) => link.getAttribute("href") === "/work-orders" && link.textContent?.includes("Work Orders"))).toBe(true);
    expect(links.some((link) => link.getAttribute("href") === "/automation-jobs" && link.textContent?.includes("Automation Jobs"))).toBe(true);
    expect(links.some((link) => link.getAttribute("href") === "/royal-brief" && link.textContent?.includes("Royal Brief"))).toBe(true);
  });

  describe("context refresh CTA", () => {
    const contextQueueDto: NextActionQueueDto = {
      computedAt: observedAt,
      topAction: mockContextItem,
      queue: [mockContextItem],
      summary: { totalPending: 1, criticalCount: 0, highCount: 0, blockedCount: 1, escalatedCount: 0 }
    };

    it("renders context item action as a button (not a link)", async () => {
      setUser("KING");
      apiMocks.getNextActions.mockResolvedValue(contextQueueDto);

      renderPage();

      // Title appears in both TopActionCard and queue — use findAllByText
      await screen.findAllByText(mockContextItem.title);
      // The "Bind Context" CTA should be a button, not a link to /work-orders
      const buttons = screen.getAllByRole("button", { name: /Bind Context/i });
      expect(buttons.length).toBeGreaterThan(0);
      // Verify no link contains "Bind Context" text
      const links = screen.queryAllByRole("link");
      const workOrderLink = links.find(l => l.getAttribute("href") === "/work-orders" && l.textContent?.includes("Bind Context"));
      expect(workOrderLink).toBeUndefined();
    });

    it("calls refreshWorkOrderContext when Bind Context button is clicked and refetches queue", async () => {
      setUser("KING");
      apiMocks.getNextActions.mockResolvedValue(contextQueueDto);
      apiMocks.refreshWorkOrderContext.mockResolvedValue({
        result: { workOrderId: "wo-ctx-1", status: "REFRESHED", oldStatus: "STALE", newStatus: "FRESH", scanRan: true, scanFailures: [], warnings: [] }
      });

      renderPage();

      await screen.findAllByText(mockContextItem.title);
      const buttons = screen.getAllByRole("button", { name: /Bind Context/i });
      await userEvent.click(buttons[0]!);

      await waitFor(() => {
        expect(apiMocks.refreshWorkOrderContext).toHaveBeenCalledWith("wo-ctx-1");
        expect(apiMocks.getNextActions).toHaveBeenCalledTimes(2);
      });
    });

    it("shows Refreshing… during context refresh API call", async () => {
      setUser("KING");
      apiMocks.getNextActions.mockResolvedValue(contextQueueDto);
      let resolveRefresh!: (value: { result: { workOrderId: string; status: string; oldStatus: string; newStatus: string | null; scanRan: boolean; scanFailures: string[]; warnings: string[] } }) => void;
      apiMocks.refreshWorkOrderContext.mockReturnValue(
        new Promise((resolve) => { resolveRefresh = resolve; })
      );

      renderPage();

      await screen.findAllByText(mockContextItem.title);
      const buttons = screen.getAllByRole("button", { name: /Bind Context/i });
      void userEvent.click(buttons[0]!);

      await waitFor(() => {
        expect(screen.getAllByText(/Refreshing/i).length).toBeGreaterThan(0);
      });

      resolveRefresh({ result: { workOrderId: "wo-ctx-1", status: "REFRESHED", oldStatus: "STALE", newStatus: "FRESH", scanRan: true, scanFailures: [], warnings: [] } });
    });
  });

  it("shows the high plus critical sidebar badge when supported", async () => {
    setUser("KING");
    apiMocks.getNextActions.mockResolvedValue(mockQueueDto);

    renderLayout();

    await waitFor(() => {
      const inboxLinks = screen.getAllByRole("link", { name: /Action Queue/i });
      expect(inboxLinks.some((link) => link.textContent?.includes("2"))).toBe(true);
    });
  });
});
