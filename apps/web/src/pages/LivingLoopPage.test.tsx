import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationCandidateDto, LivingLoopRunDto, LivingLoopStatusDto, PublicUser } from "@/types/api";
import { LivingLoopPage } from "./LivingLoopPage";

const mockStatus: LivingLoopStatusDto = {
  enabled: true,
  lastRun: null,
  lastResult: "COMPLETED",
  todayCandidates: 2,
  pendingCandidates: 1,
  highCriticalCandidates: 0,
  runnerIssues: 0,
  providerIssues: 0,
  patchesPendingReview: 1,
  autoContextRepair: {
    enabled: true,
    dailyCount: 3,
    dailyLimit: 20,
    cooldownMinutes: 30,
    repairedLastRun: 2
  },
  autoValidation: {
    enabled: true,
    dailyCount: 2,
    dailyLimit: 10,
    cooldownMinutes: 60,
    jobsCreatedLastRun: 1,
    validationFailuresNeedingReview: 0
  },
  autoSandboxPatch: {
    enabled: true,
    dailyCount: 0,
    dailyLimit: 5,
    cooldownMinutes: 15,
    minConfidence: 85,
    jobsCreatedLastRun: 0
  }
};

const mockRuns: LivingLoopRunDto[] = [
  {
    id: "run-1",
    status: "COMPLETED",
    triggerType: "MANUAL",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    summary: "Observed kingdom state and proposed 1 candidate.",
    observedCounts: { patchesPendingReview: 1 },
    proposedCandidates: 1,
    skippedCandidates: 0,
    createdJobs: 0,
    skippedReasons: null,
    error: null,
    createdAt: new Date().toISOString()
  }
];

const mockCandidate: AutomationCandidateDto = {
  id: "candidate-1",
  kind: "PATCH_REVIEW",
  title: "Patch pending review: Refactor auth middleware",
  summary: "A patch is awaiting validation review.",
  reason: "Patch has been pending review for over 24 hours.",
  confidence: 80,
  priority: "MEDIUM",
  riskLevel: "MEDIUM",
  sourceType: "PatchArtifact",
  sourceId: "patch-1",
  projectId: null,
  agentId: null,
  workOrderId: "wo-1",
  automationJobId: "job-1",
  patchArtifactId: "patch-1",
  proposedAction: { action: "review_patch", targetId: "patch-1" },
  provenance: { source: "PatchArtifact", id: "patch-1" },
  dataQuality: "OK",
  status: "PENDING",
  loopRunId: "run-1",
  reviewedByUserId: null,
  reviewedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const apiMocks = vi.hoisted(() => ({
  livingLoopStatus: vi.fn(),
  livingLoopRuns: vi.fn(),
  runLivingLoopOnce: vi.fn(),
  automationCandidates: vi.fn(),
  approveAutomationCandidate: vi.fn(),
  rejectAutomationCandidate: vi.fn(),
  archiveAutomationCandidate: vi.fn(),
  applyAutomationCandidate: vi.fn(),
  settings: vi.fn(),
  updateSetting: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser })
}));

function setUser(role: PublicUser["role"]) {
  currentUser = {
    id: "user-1",
    email: `${role.toLowerCase()}@aikingdom.local`,
    displayName: role,
    role
  };
}

function setupApiMocks(candidates: AutomationCandidateDto[] = [mockCandidate]) {
  apiMocks.livingLoopStatus.mockResolvedValue({ status: mockStatus });
  apiMocks.livingLoopRuns.mockResolvedValue({ runs: mockRuns });
  apiMocks.automationCandidates.mockResolvedValue({ candidates, total: candidates.length });
  apiMocks.runLivingLoopOnce.mockResolvedValue({ run: mockRuns[0], candidates: [] });
  apiMocks.settings.mockResolvedValue({ settings: [] });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("LivingLoopPage", () => {
  it("renders the Living Loop page with status and run history", async () => {
    setUser("CROWN_PRINCE");
    setupApiMocks([]);

    render(<LivingLoopPage />);

    expect(await screen.findByText("Living Loop")).toBeInTheDocument();
    expect(await screen.findByText("Loop Status")).toBeInTheDocument();
    expect(await screen.findByText("Run History")).toBeInTheDocument();
  });

  it("renders candidate queue items with reason and provenance", async () => {
    setUser("CROWN_PRINCE");
    setupApiMocks([mockCandidate]);

    render(<LivingLoopPage />);

    expect(await screen.findByText(mockCandidate.title)).toBeInTheDocument();
    expect(screen.getByText(/Reason: Patch has been pending review/)).toBeInTheDocument();
    expect(screen.getByText("Provenance")).toBeInTheDocument();
  });

  it("shows approve, reject, and apply controls for KING", async () => {
    setUser("KING");
    setupApiMocks([
      mockCandidate,
      { ...mockCandidate, id: "candidate-2", status: "APPROVED", title: "Approved candidate" }
    ]);

    render(<LivingLoopPage />);

    await screen.findByText(mockCandidate.title);
    expect(screen.getByRole("button", { name: /Approve/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply/ })).toBeInTheDocument();
  });

  it("hides approve, reject, and apply controls for non-KING roles", async () => {
    setUser("CROWN_PRINCE");
    setupApiMocks([mockCandidate]);

    render(<LivingLoopPage />);

    await screen.findByText(mockCandidate.title);
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reject/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply/ })).not.toBeInTheDocument();
  });

  it("shows the Auto Validation section with daily count and cooldown", async () => {
    setUser("KING");
    setupApiMocks([]);

    render(<MemoryRouter><LivingLoopPage /></MemoryRouter>);

    expect(await screen.findByText("Auto Validation")).toBeInTheDocument();
    expect(screen.getByText("2 / 10")).toBeInTheDocument();
    expect(screen.getByText("60m")).toBeInTheDocument();
    expect(screen.getAllByText("Created Last Run").length).toBeGreaterThan(0);
    expect(screen.getByText("Failures To Review")).toBeInTheDocument();
  });

  it("shows auto context repair status, limits, and safety boundary", async () => {
    setUser("KING");
    setupApiMocks([]);

    render(<MemoryRouter><LivingLoopPage /></MemoryRouter>);

    expect(await screen.findByText("Auto Context Repair")).toBeInTheDocument();
    expect(screen.getByText("3 / 20")).toBeInTheDocument();
    expect(screen.getByText("30m")).toBeInTheDocument();
    expect(screen.getByText("Repaired Last Run")).toBeInTheDocument();
    expect(screen.getByText(/does not approve, push, merge, or deploy a patch/)).toBeInTheDocument();
  });

  it("shows an auto-created job link on an APPLIED VALIDATION_JOB candidate", async () => {
    setUser("KING");
    const appliedValidationCandidate: AutomationCandidateDto = {
      ...mockCandidate,
      id: "candidate-validation-1",
      kind: "VALIDATION_JOB",
      status: "APPLIED",
      title: "Validate Work Order: Feature X",
      automationJobId: "job-auto-12345678"
    };
    setupApiMocks([appliedValidationCandidate]);

    render(<MemoryRouter><LivingLoopPage /></MemoryRouter>);

    await screen.findByText(appliedValidationCandidate.title);
    const link = screen.getByRole("link", { name: /Auto-created job/ });
    expect(link).toHaveAttribute("href", "/automation-jobs");
  });

  it("shows a skip note on a pending VALIDATION_JOB candidate when auto validation is disabled", async () => {
    setUser("KING");
    apiMocks.livingLoopStatus.mockResolvedValue({
      status: { ...mockStatus, autoValidation: { ...mockStatus.autoValidation, enabled: false } }
    });
    apiMocks.livingLoopRuns.mockResolvedValue({ runs: mockRuns });
    const pendingValidationCandidate: AutomationCandidateDto = {
      ...mockCandidate,
      id: "candidate-validation-2",
      kind: "VALIDATION_JOB",
      status: "PENDING",
      title: "Validate Work Order: Feature Y",
      automationJobId: null
    };
    apiMocks.automationCandidates.mockResolvedValue({ candidates: [pendingValidationCandidate], total: 1 });
    apiMocks.settings.mockResolvedValue({ settings: [] });

    render(<MemoryRouter><LivingLoopPage /></MemoryRouter>);

    await screen.findByText(pendingValidationCandidate.title);
    expect(screen.getByText(/auto validation is disabled/)).toBeInTheDocument();
  });

  it("calls runLivingLoopOnce when Run Once is clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    setupApiMocks([]);

    render(<LivingLoopPage />);

    const runButtons = await screen.findAllByRole("button", { name: /Run Once/ });
    await userEvent.click(runButtons[0]!);

    expect(apiMocks.runLivingLoopOnce).toHaveBeenCalledTimes(1);
  });
});
