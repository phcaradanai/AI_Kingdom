import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser, RoyalBriefDto } from "@/types/api";
import { RoyalBriefPage } from "./RoyalBriefPage";

const observedAt = new Date().toISOString();

const mockBrief: RoyalBriefDto = {
  id: "brief-ctx-1",
  title: "Daily Royal Brief — context",
  briefDate: observedAt,
  status: "READY",
  summary: "Context health summary test brief.",
  highlights: { items: [] },
  decisionsNeeded: {
    items: [
      {
        id: "context-refresh:proj-1",
        title: "Refresh project context before patching: Castle Keep",
        why: "Open work order(s) have MISSING context binding.",
        sourceLink: "/projects/proj-1",
        riskLevel: "MEDIUM",
        recommendedAction: "Run a fresh local docs scan, then bind/refresh context on the project's open work orders.",
        availableActions: ["scan_local_docs", "bind_context"],
        provenance: { source: "ProjectContextBinding", id: "proj-1", observedAt }
      }
    ]
  },
  runnerStatus: { runners: [], onlineCount: 0, offlineCount: 0, errorCount: 0, staleCount: 0 },
  livingLoopSummary: { runsInWindow: 0, lastRun: null, candidatesCreated: 0, candidatesApplied: 0, candidatesPending: 0, candidatesRejected: 0, candidatesArchived: 0 },
  validationSummary: { jobsCreated: 0, jobsCompleted: 0, jobsFailed: 0, jobsNeedingReview: 0, autoValidation: { enabled: false, dailyCount: 0, dailyLimit: 10, cooldownMinutes: 60 } },
  patchSummary: { jobsCreated: 0, patchesNeedingReview: [], autoSandboxPatch: { enabled: false, dailyCount: 0, dailyLimit: 3, cooldownMinutes: 120, minConfidence: 85 } },
  providerSummary: { summary: [], recentErrorCounts: [] },
  treasurySummary: { totalCostUSD: 0, dailyBudgetLimitUSD: null, monthlyBudgetLimitUSD: null, overDailyBudget: false },
  memorySummary: { pendingCandidates: 0, approvedInWindow: 0, rejectedInWindow: 0 },
  riskSummary: { pendingByRiskLevel: {}, highCriticalPending: 0 },
  localDocsSummary: { issues: [], projectsMissingRoot: 0, projectsMissingSnapshot: 0, projectsWithFailedScan: 0, projectsWithStaleSnapshot: 0, projectsWithChangedDocs: 0, workOrdersBlocked: [] },
  contextHealthSummary: {
    workOrdersBlockedByContext: [
      { id: "wo-1", title: "Fix the drawbridge", priority: "HIGH", projectId: "proj-1", projectName: "Castle Keep", contextBindingStatus: "MISSING" }
    ],
    autoJobsSkippedForContext: 2,
    contextSkippedReasons: ["AutoSandboxPatch: ContextBinding:missing (wo-1) "],
    patchesWithStaleBaseContext: [{ id: "patch-1", title: "Old patch", riskLevel: "LOW", baseContextStatus: "STALE", workOrderId: "wo-1", projectId: "proj-1" }],
    projectsNeedingContextRefresh: [{ projectId: "proj-1", projectName: "Castle Keep", reason: "Open work order(s) have MISSING context binding." }]
  },
  livingAgentDigest: { items: [] },
  provenance: { generatedAt: observedAt, windowHours: 24, since: observedAt, sources: ["ProjectContextBinding"] },
  generatedBy: "SYSTEM",
  generatedByUserId: null,
  createdAt: observedAt,
  updatedAt: observedAt
};

const apiMocks = vi.hoisted(() => ({
  latestRoyalBrief: vi.fn(),
  generateRoyalBrief: vi.fn(),
  rebindWorkOrderContext: vi.fn(),
  reconcileContextWarnings: vi.fn()
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

describe("RoyalBriefPage — Context Health (M17E-2)", () => {
  it("renders the Context Health section with blocked work orders and skip reasons", async () => {
    currentUser = { id: "user-1", email: "king@aikingdom.local", displayName: "King", role: "KING" };
    apiMocks.latestRoyalBrief.mockResolvedValue({ brief: mockBrief });

    render(<MemoryRouter><RoyalBriefPage /></MemoryRouter>);

    expect(await screen.findByText("Context Health")).toBeInTheDocument();
    expect(screen.getByText("Fix the drawbridge")).toBeInTheDocument();
    expect(screen.getByText(/MISSING context · Castle Keep/)).toBeInTheDocument();
    expect(screen.getByText(/ContextBinding:missing/)).toBeInTheDocument();
  });

  it("renders the context refresh decision card", async () => {
    currentUser = { id: "user-1", email: "king@aikingdom.local", displayName: "King", role: "KING" };
    apiMocks.latestRoyalBrief.mockResolvedValue({ brief: mockBrief });

    render(<MemoryRouter><RoyalBriefPage /></MemoryRouter>);

    expect(await screen.findByText("Refresh project context before patching: Castle Keep")).toBeInTheDocument();
    expect(screen.getByText(/Run a fresh local docs scan/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("href", "/projects/proj-1");
  });
});
