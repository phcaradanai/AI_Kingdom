import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationJobDto, PatchArtifactDto } from "@/types/api";
import { AutomationJobsPage } from "./AutomationJobsPage";

const nowIso = new Date().toISOString();

const baseJob: AutomationJobDto = {
  id: "job-ctx-1",
  workOrderId: "wo-1",
  projectId: "proj-1",
  agentId: null,
  runnerId: null,
  status: "APPROVED",
  mode: "VALIDATION_ONLY",
  commandPolicy: "VALIDATION_ONLY",
  allowedCommands: ["npm", "git"],
  provenance: null,
  planJson: null,
  patchSummary: null,
  logsPreview: null,
  localDocumentSnapshotId: "snap-1",
  repositorySnapshotId: null,
  contextRequired: false,
  contextValidationStatus: "PARTIAL",
  contextValidationSummary: { status: "PARTIAL", warnings: ["No Local Document Root is configured for this project."] },
  createdByUserId: null,
  approvedByUserId: null,
  startedAt: null,
  completedAt: null,
  createdAt: nowIso,
  updatedAt: nowIso,
  workOrder: { id: "wo-1", title: "Validate context feature", status: "READY", projectId: "proj-1" },
  project: { id: "proj-1", name: "Castle Keep" },
  agent: null,
  runner: null,
  createdByUser: null,
  approvedByUser: null
};

const stalePatch: PatchArtifactDto = {
  id: "patch-ctx-1",
  automationJobId: "job-ctx-1",
  workOrderId: "wo-1",
  projectId: "proj-1",
  title: "Context patch",
  summary: "A patch with stale base context",
  diffStat: null,
  diffPreview: null,
  fullPatch: null,
  fullPatchTruncated: false,
  filesChanged: ["README.md"],
  riskLevel: "LOW",
  validationStatus: "PENDING",
  validationResults: null,
  reviewedByUserId: null,
  reviewNote: null,
  blockedPaths: [],
  branchName: null,
  branchPushed: false,
  prUrl: null,
  localDocumentSnapshotId: "snap-old",
  repositorySnapshotId: null,
  baseContextStatus: "STALE",
  baseContextProvenance: { source: "PROJECT_CONTEXT_BINDING" },
  createdAt: nowIso,
  updatedAt: nowIso,
  automationJob: { id: "job-ctx-1", status: "NEEDS_REVIEW", workOrderId: "wo-1" },
  workOrder: { id: "wo-1", title: "Validate context feature" },
  reviewedByUser: null
};

const apiMocks = vi.hoisted(() => ({
  automationJobs: vi.fn(),
  runners: vi.fn(),
  automationJob: vi.fn(),
  patchArtifacts: vi.fn(),
  approveAutomationJob: vi.fn(),
  cancelAutomationJob: vi.fn(),
  approvePatchArtifact: vi.fn(),
  rejectPatchArtifact: vi.fn(),
  requestPatchRevision: vi.fn(),
  createPatchPr: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({ user: { id: "user-1", email: "king@aikingdom.local", displayName: "King", role: "KING" } })
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("AutomationJobsPage — context binding (M17E-2)", () => {
  it("shows a context status badge on the job list", async () => {
    apiMocks.automationJobs.mockResolvedValue([baseJob]);
    apiMocks.runners.mockResolvedValue([]);

    render(<MemoryRouter><AutomationJobsPage /></MemoryRouter>);

    expect(await screen.findByText("Validate context feature")).toBeInTheDocument();
    expect(screen.getByText("Context: PARTIAL")).toBeInTheDocument();
  });

  it("shows the Context Binding panel, partial-context warning, and Base Context Used in the detail view", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    apiMocks.automationJobs.mockResolvedValue([baseJob]);
    apiMocks.runners.mockResolvedValue([]);
    apiMocks.automationJob.mockResolvedValue(baseJob);
    apiMocks.patchArtifacts.mockResolvedValue([stalePatch]);

    render(<MemoryRouter><AutomationJobsPage /></MemoryRouter>);

    await userEvent.click(await screen.findByText("Validate context feature"));

    expect(await screen.findByText("Context Binding")).toBeInTheDocument();
    expect(screen.getByText(/Validation-only job ran with PARTIAL project context/)).toBeInTheDocument();
    expect(screen.getByText("Local docs snapshot: snap-1")).toBeInTheDocument();

    expect(screen.getByText("Base Context Used")).toBeInTheDocument();
    expect(screen.getByText(/Patch created from STALE project context/)).toBeInTheDocument();
    expect(screen.getByText("Local docs snapshot: snap-old")).toBeInTheDocument();
  });

  it("does not render a context badge for jobs without context validation", async () => {
    apiMocks.automationJobs.mockResolvedValue([{ ...baseJob, id: "job-ctx-2", contextValidationStatus: "NOT_REQUIRED", localDocumentSnapshotId: null }]);
    apiMocks.runners.mockResolvedValue([]);

    render(<MemoryRouter><AutomationJobsPage /></MemoryRouter>);

    expect(await screen.findByText("Validate context feature")).toBeInTheDocument();
    expect(screen.queryByText(/Context: /)).not.toBeInTheDocument();
  });
});
