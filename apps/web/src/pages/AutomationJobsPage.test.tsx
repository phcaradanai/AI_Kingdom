import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type { AutomationJobDto } from "@/types/api";
import { AutomationJobsPage } from "./AutomationJobsPage";

const baseJob: AutomationJobDto = {
  id: "job-1",
  workOrderId: "wo-1",
  projectId: null,
  agentId: null,
  runnerId: null,
  status: "APPROVED",
  mode: "VALIDATION_ONLY",
  commandPolicy: "VALIDATION_ONLY",
  allowedCommands: ["npm", "git"],
  provenance: { source: "LIVING_LOOP_AUTO_VALIDATION", loopRunId: "run-12345678", candidateId: "cand-12345678" },
  planJson: null,
  patchSummary: null,
  logsPreview: null,
  createdByUserId: null,
  approvedByUserId: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  workOrder: { id: "wo-1", title: "Validate feature X", status: "NEEDS_REVIEW", projectId: null },
  project: null,
  agent: null,
  runner: null,
  createdByUser: null,
  approvedByUser: null
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
  createPatchPr: vi.fn(),
  pushPatchBranch: vi.fn(),
  automationJobAgentReview: vi.fn(),
  regenerateAutomationJobAgentReview: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({ user: { id: "user-1", email: "king@aikingdom.local", displayName: "King", role: "KING" } })
}));

afterEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

beforeEach(() => {
  apiMocks.automationJobAgentReview.mockResolvedValue({ agentReview: null });
});

describe("AutomationJobsPage", () => {
  it("shows the Living Loop Auto Validation source badge and Validation Only mode badge", async () => {
    apiMocks.automationJobs.mockResolvedValue([baseJob]);
    apiMocks.runners.mockResolvedValue([]);

    render(<MemoryRouter><AutomationJobsPage /></MemoryRouter>);

    expect(await screen.findByText("Validate feature X")).toBeInTheDocument();
    expect(screen.getByText("Living Loop Auto Validation")).toBeInTheDocument();
    expect(screen.getByText("Validation Only")).toBeInTheDocument();
  });

  it("does not show the Living Loop badge for manually created jobs", async () => {
    apiMocks.automationJobs.mockResolvedValue([{ ...baseJob, id: "job-2", mode: "SANDBOX_PATCH", provenance: null }]);
    apiMocks.runners.mockResolvedValue([]);

    render(<MemoryRouter><AutomationJobsPage /></MemoryRouter>);

    expect(await screen.findByText("Validate feature X")).toBeInTheDocument();
    expect(screen.queryByText("Living Loop Auto Validation")).not.toBeInTheDocument();
  });

  it("links back to the living loop candidate and run in the detail panel", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    apiMocks.automationJobs.mockResolvedValue([baseJob]);
    apiMocks.runners.mockResolvedValue([]);
    apiMocks.automationJob.mockResolvedValue(baseJob);
    apiMocks.patchArtifacts.mockResolvedValue([]);

    render(<MemoryRouter><AutomationJobsPage /></MemoryRouter>);

    await userEvent.click(await screen.findByText("Validate feature X"));

    const link = await screen.findByRole("link", { name: /Candidate cand-123 · Run run-1234/ });
    expect(link).toHaveAttribute("href", "/living-loop");
  });

  it("keeps execution actions in the selected detail instead of the queue", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const queuedJob = { ...baseJob, status: "QUEUED" as const, mode: "SANDBOX_PATCH" as const, provenance: null };
    apiMocks.automationJobs.mockResolvedValue([queuedJob]);
    apiMocks.runners.mockResolvedValue([]);
    apiMocks.automationJob.mockResolvedValue(queuedJob);
    apiMocks.patchArtifacts.mockResolvedValue([]);

    render(<MemoryRouter><AutomationJobsPage /></MemoryRouter>);

    expect(await screen.findByTestId("automation-jobs-workspace")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve for Execution/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Validate feature X"));

    expect(await screen.findByTestId("automation-job-decision-summary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve for Execution/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Work Order: Validate feature X/i })).toHaveAttribute("href", "/work-orders?focus=wo-1");
  });

  it("renders the execution queue chrome in Thai", async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "th");
    apiMocks.automationJobs.mockResolvedValue([]);
    apiMocks.runners.mockResolvedValue([]);

    render(<MemoryRouter><AutomationJobsPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "งานอัตโนมัติ" })).toBeInTheDocument();
    expect(screen.getByText("คิวดำเนินงาน")).toBeInTheDocument();
    expect(screen.getByText("ตัวกรองขั้นสูง")).toBeInTheDocument();
    expect(screen.getByText("ไม่มีงานตรงกับมุมมองนี้")).toBeInTheDocument();
  });
});
