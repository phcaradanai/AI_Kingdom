import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationJobDto, ImplementationReportDto, PatchArtifactDto } from "@/types/api";
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

describe("AutomationJobsPage — NO_CHANGES SANDBOX_PATCH report", () => {
  it("renders the NO_CHANGES summary and no patch artifact section when the job produced no file modifications", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");

    const noChangesReport: ImplementationReportDto = {
      id: "report-nc-1",
      workOrderId: "wo-nc-1",
      projectId: "proj-1",
      workSessionId: null,
      externalAgentId: null,
      summary: `NO_CHANGES: Sandbox run for "Fix typo" produced no file modifications. This job did not apply any edits. Review the work order and provide an actual patch or diff.`,
      filesChanged: [],
      commandsRun: ["npm run typecheck", "npm run test --workspace @ai-kingdom/api"],
      testsRun: ["npm run typecheck"],
      testResult: "PASSED",
      errors: [],
      decisionsMade: [],
      remainingWork: ["Review the work order and provide a model-generated patch or diff. No files were changed during this sandbox run."],
      nextRecommendedAction: "Review the work order — no files were modified. Provide an actual patch/diff and retry SANDBOX_PATCH.",
      rawOutput: null,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const sandboxJob: AutomationJobDto = {
      ...baseJob,
      id: "job-nc-1",
      mode: "SANDBOX_PATCH",
      commandPolicy: "SANDBOX_PATCH_NO_PUSH",
      status: "NEEDS_REVIEW",
      patchSummary: "No files changed.",
      contextValidationStatus: "NOT_REQUIRED",
      localDocumentSnapshotId: null,
      workOrder: { id: "wo-nc-1", title: "Fix typo", status: "NEEDS_REVIEW", projectId: "proj-1" },
      implementationReports: [noChangesReport]
    };

    apiMocks.automationJobs.mockResolvedValue([sandboxJob]);
    apiMocks.runners.mockResolvedValue([]);
    apiMocks.automationJob.mockResolvedValue(sandboxJob);
    apiMocks.patchArtifacts.mockResolvedValue([]);

    render(<MemoryRouter><AutomationJobsPage /></MemoryRouter>);

    await userEvent.click(await screen.findByText("Fix typo"));

    expect(await screen.findByText(/NO_CHANGES:/)).toBeInTheDocument();
    expect(screen.queryByText(/Patch Review/)).not.toBeInTheDocument();
  });
});
