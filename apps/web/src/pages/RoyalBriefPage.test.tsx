import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LivingAgentDigestEntryDto, PublicUser, RoyalBriefDto } from "@/types/api";
import { RoyalBriefPage } from "./RoyalBriefPage";

const observedAt = new Date().toISOString();

const mockDigestEntry: LivingAgentDigestEntryDto = {
  agentId: "agent-1",
  slug: "grand-vizier",
  displayName: "Grand Vizier",
  displayTitle: "Royal Coordinator",
  role: "VIZIER",
  avatarUrl: null,
  actionsProposed: 2,
  jobsExecuted: 1,
  reportsProduced: 1,
  candidatesCreated: 2,
  failures: 0,
  status: "IDLE"
};

const mockBrief: RoyalBriefDto = {
  id: "brief-1",
  title: "Daily Royal Brief — 2026-06-12",
  briefDate: observedAt,
  status: "READY",
  summary: "In the last 24h: 1 Living Loop run(s), 2 candidate(s) proposed, 1 patch(es) awaiting review, 1 decision(s) needed, 1/1 runner(s) online.",
  highlights: {
    items: [
      { title: "Living Loop activity", detail: "1 run(s) in the last 24h, proposing 2 candidate(s).", provenance: { source: "LivingLoopRun", observedAt } }
    ]
  },
  decisionsNeeded: {
    items: [
      {
        id: "patch:patch-1",
        title: "Patch needs review: Refactor auth middleware",
        why: "Patch artifact has HIGH risk and validation status PENDING.",
        sourceLink: "/automation-jobs",
        riskLevel: "HIGH",
        recommendedAction: "Review the patch diff and validation results, then approve, reject, or request revision.",
        availableActions: ["approve", "reject", "request_revision"],
        provenance: { source: "PatchArtifact", id: "patch-1", observedAt }
      }
    ]
  },
  runnerStatus: {
    runners: [{ id: "runner-1", name: "primary-runner", status: "ONLINE", lastHeartbeatAt: observedAt, isStale: false }],
    onlineCount: 1,
    offlineCount: 0,
    errorCount: 0,
    staleCount: 0
  },
  livingLoopSummary: {
    runsInWindow: 1,
    completedRuns: 1,
    failedRuns: 0,
    skippedRuns: 0,
    lastRun: {
      id: "run-1",
      status: "COMPLETED",
      triggerType: "MANUAL",
      startedAt: observedAt,
      completedAt: observedAt,
      summary: "Observed kingdom state.",
      proposedCandidates: 2,
      skippedCandidates: 0,
      createdJobs: 0
    },
    candidatesCreated: 2,
    candidatesApplied: 0,
    candidatesPending: 2,
    candidatesRejected: 0,
    candidatesArchived: 0
  },
  validationSummary: {
    jobsCreated: 1,
    jobsCompleted: 1,
    jobsFailed: 0,
    jobsNeedingReview: 0,
    autoValidation: { enabled: true, dailyCount: 1, dailyLimit: 10, cooldownMinutes: 60 }
  },
  patchSummary: {
    jobsCreated: 1,
    patchesNeedingReview: [
      { id: "patch-1", title: "Refactor auth middleware", riskLevel: "HIGH", validationStatus: "PENDING", workOrderId: "wo-1", projectId: null, automationJobId: "job-1" }
    ],
    autoSandboxPatch: { enabled: false, dailyCount: 0, dailyLimit: 3, cooldownMinutes: 120, minConfidence: 85 }
  },
  providerSummary: {
    summary: [{ providerType: "openai", providerId: null, healthStatus: "HEALTHY", failureRate: 0, timeoutRate: 0, sampleSize: 10 }],
    recentErrorCounts: []
  },
  treasurySummary: { totalCostUSD: 0.1234, dailyBudgetLimitUSD: 5, monthlyBudgetLimitUSD: 100, overDailyBudget: false },
  memorySummary: { pendingCandidates: 0, approvedInWindow: 0, rejectedInWindow: 0 },
  riskSummary: { pendingByRiskLevel: { HIGH: 1 }, highCriticalPending: 1 },
  livingAgentDigest: { items: [mockDigestEntry] },
  provenance: {
    generatedAt: observedAt,
    windowHours: 24,
    since: observedAt,
    sources: ["LivingLoopRun", "AutomationCandidate", "AutomationJob", "PatchArtifact", "AgentRunner", "ProviderHealthSnapshot", "AIUsageTrace", "TreasuryLedger", "WorkOrder", "AgentKnowledgeCandidate", "AgentActivity"]
  },
  generatedBy: "SYSTEM",
  generatedByUserId: null,
  createdAt: observedAt,
  updatedAt: observedAt
};

const apiMocks = vi.hoisted(() => ({
  latestRoyalBrief: vi.fn(),
  generateRoyalBrief: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser })
}));

function setUser(role: PublicUser["role"]) {
  currentUser = { id: "user-1", email: `${role.toLowerCase()}@aikingdom.local`, displayName: role, role };
}

afterEach(() => {
  vi.clearAllMocks();
  currentUser = null;
});

describe("RoyalBriefPage", () => {
  it("shows an empty state with a Generate Now button for the King when no brief exists", async () => {
    setUser("KING");
    apiMocks.latestRoyalBrief.mockResolvedValue({ brief: null });

    render(<RoyalBriefPage />);

    expect(await screen.findByText("No Royal Brief Yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate Now/ })).toBeInTheDocument();
  });

  it("hides the Generate Now button for non-King roles when no brief exists", async () => {
    setUser("MINISTER");
    apiMocks.latestRoyalBrief.mockResolvedValue({ brief: null });

    render(<RoyalBriefPage />);

    expect(await screen.findByText("No Royal Brief Yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate Now/ })).not.toBeInTheDocument();
  });

  it("renders today's summary and highlights from the latest brief", async () => {
    setUser("KING");
    apiMocks.latestRoyalBrief.mockResolvedValue({ brief: mockBrief });

    render(<RoyalBriefPage />);

    expect(await screen.findByText(mockBrief.summary)).toBeInTheDocument();
    expect(screen.getByText("Living Loop activity")).toBeInTheDocument();
    expect(screen.getByText(/proposing 2 candidate/)).toBeInTheDocument();
  });

  it("renders decisions needed with risk level, recommended action, and source link", async () => {
    setUser("KING");
    apiMocks.latestRoyalBrief.mockResolvedValue({ brief: mockBrief });

    render(<RoyalBriefPage />);

    expect(await screen.findByText("Patch needs review: Refactor auth middleware")).toBeInTheDocument();
    expect(screen.getAllByText("HIGH").length).toBeGreaterThan(0);
    expect(screen.getByText(/Review the patch diff and validation results/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("href", "/automation-jobs");
  });

  it("renders the Living Agent Activity Digest with per-agent counts", async () => {
    setUser("KING");
    apiMocks.latestRoyalBrief.mockResolvedValue({ brief: mockBrief });

    render(<RoyalBriefPage />);

    expect(await screen.findByText("Grand Vizier")).toBeInTheDocument();
    expect(screen.getByText("Royal Coordinator · VIZIER")).toBeInTheDocument();
    expect(screen.getByText("IDLE")).toBeInTheDocument();
  });

  it("calls generateRoyalBrief and renders the returned brief when Generate Now is clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    apiMocks.latestRoyalBrief.mockResolvedValue({ brief: null });
    apiMocks.generateRoyalBrief.mockResolvedValue({ brief: mockBrief });

    render(<RoyalBriefPage />);

    const button = await screen.findByRole("button", { name: /Generate Now/ });
    await userEvent.click(button);

    await waitFor(() => expect(apiMocks.generateRoyalBrief).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(mockBrief.summary)).toBeInTheDocument();
  });
});
