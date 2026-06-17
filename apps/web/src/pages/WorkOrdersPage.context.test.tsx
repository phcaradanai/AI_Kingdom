import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExternalAgentRecommendationDto, PatchArtifactDto, PublicUser, WorkOrderContextDto, WorkOrderDto } from "@/types/api";
import { WorkOrdersPage } from "./WorkOrdersPage";

const nowIso = new Date().toISOString();

const mockOrder: WorkOrderDto = {
  id: "wo-1",
  title: "Fix the drawbridge",
  objective: "Repair the drawbridge mechanism",
  context: "",
  instructions: "",
  constraints: "",
  acceptanceCriteria: [],
  validationCommands: [],
  projectId: "proj-1",
  targetProject: null,
  targetRepository: null,
  sourceType: null,
  sourceId: null,
  assignedExternalAgentId: null,
  assignedAgentId: null,
  assignedAgentReason: null,
  assignedAgentConfidence: null,
  status: "READY",
  priority: "MEDIUM",
  createdByUserId: null,
  createdByAgentId: null,
  isTestData: false,
  createdBySystem: false,
  createdAt: nowIso,
  updatedAt: nowIso
};

function makeContext(status: WorkOrderContextDto["contextBindingStatus"]): WorkOrderContextDto {
  return {
    id: "wo-1",
    projectId: "proj-1",
    contextBindingStatus: status,
    contextBoundAt: status === "MISSING" ? null : nowIso,
    localDocumentSnapshotId: status === "MISSING" ? null : "snap-1",
    repositorySnapshotId: null,
    contextBindingSummary: {
      projectId: "proj-1",
      localDocumentSnapshotId: "snap-1",
      localSnapshotScannedAt: nowIso,
      detectedStack: ["Express", "TypeScript"],
      packageScripts: { dev: "vite" },
      importantDocs: ["README.md"],
      riskZones: [{ relativePath: "apps/api/src/services/authService.ts", riskLevel: "HIGH" }]
    },
    contextBindingProvenance: { source: "PROJECT_CONTEXT_BINDING" },
    current: { status, lines: [`Project context is ${status}.`], binding: null as never }
  };
}

const mockPatch: PatchArtifactDto = {
  id: "patch-1",
  automationJobId: "job-1",
  workOrderId: "wo-1",
  projectId: "proj-1",
  title: "Drawbridge patch",
  summary: "Repairs the drawbridge",
  diffStat: null,
  diffPreview: null,
  fullPatch: null,
  fullPatchTruncated: false,
  filesChanged: ["apps/api/src/services/authService.ts"],
  riskLevel: "LOW",
  validationStatus: "PENDING",
  validationResults: null,
  reviewedByUserId: null,
  reviewNote: null,
  blockedPaths: [],
  branchName: null,
  branchPushed: false,
  prUrl: null,
  localDocumentSnapshotId: "snap-1",
  repositorySnapshotId: null,
  baseContextStatus: "STALE",
  baseContextProvenance: {
    source: "PROJECT_CONTEXT_BINDING",
    contextValidationSummary: {
      riskZones: [{ relativePath: "apps/api/src/services/authService.ts", riskLevel: "HIGH", reason: "Auth path" }]
    }
  },
  createdAt: nowIso,
  updatedAt: nowIso,
  automationJob: { id: "job-1", status: "NEEDS_REVIEW", workOrderId: "wo-1" },
  workOrder: { id: "wo-1", title: "Fix the drawbridge" },
  reviewedByUser: null
};

const apiMocks = vi.hoisted(() => ({
  workOrders: vi.fn(),
  externalAgents: vi.fn(),
  projects: vi.fn(),
  automationJobs: vi.fn(),
  patchArtifacts: vi.fn(),
  getWorkOrderContext: vi.fn(),
  bindWorkOrderContext: vi.fn(),
  markWorkOrderContextStale: vi.fn(),
  createAutomationJobForWorkOrder: vi.fn(),
  approveAutomationJob: vi.fn(),
  approvePatchArtifact: vi.fn(),
  rejectPatchArtifact: vi.fn(),
  updateWorkOrder: vi.fn(),
  createWorkOrder: vi.fn(),
  deleteWorkOrder: vi.fn(),
  workOrderFromTask: vi.fn(),
  workOrderFromMatter: vi.fn(),
  buildWorkOrderPrompt: vi.fn(),
  createImplementationReport: vi.fn(),
  createHandoffBrief: vi.fn(),
  getWorkOrderRecommendations: vi.fn(),
  rebindWorkOrderContext: vi.fn(),
  refreshWorkOrderContext: vi.fn(),
  reconcileContextWarnings: vi.fn(),
  assignWorkOrderExternalAgent: vi.fn(),
  archiveWorkOrderAsCompleted: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser })
}));

function setUser(role: PublicUser["role"]) {
  currentUser = { id: "user-1", email: `${role.toLowerCase()}@aikingdom.local`, displayName: role, role };
}

function mockBaseApi(context: WorkOrderContextDto, patches: PatchArtifactDto[] = []) {
  apiMocks.workOrders.mockResolvedValue({ workOrders: [mockOrder], hiddenCount: 0 });
  apiMocks.externalAgents.mockResolvedValue({ externalAgents: [] });
  apiMocks.projects.mockResolvedValue({ projects: [] });
  apiMocks.automationJobs.mockResolvedValue([]);
  apiMocks.patchArtifacts.mockResolvedValue(patches);
  apiMocks.getWorkOrderContext.mockResolvedValue({ context });
  apiMocks.getWorkOrderRecommendations.mockResolvedValue({ recommendations: [] });
  apiMocks.rebindWorkOrderContext.mockResolvedValue({ result: { workOrderId: "wo-1", status: "BOUND", previousStatus: "MISSING", newStatus: "FRESH" } });
  apiMocks.refreshWorkOrderContext.mockResolvedValue({ result: { workOrderId: "wo-1", status: "REFRESHED", previousStatus: "MISSING", newStatus: "FRESH" } });
  apiMocks.reconcileContextWarnings.mockResolvedValue({ result: { totalInspected: 0, archived: 0, contextRepaired: 0, skipped: 0, results: [] } });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkOrdersPage />
    </MemoryRouter>
  );
}

async function selectOrder() {
  const { default: userEvent } = await import("@testing-library/user-event");
  await userEvent.click(await screen.findByText("Fix the drawbridge"));
}

afterEach(() => {
  vi.clearAllMocks();
  currentUser = null;
});

const mockRec: ExternalAgentRecommendationDto = {
  externalAgentId: "agent-1",
  name: "Claude Code",
  type: "CLAUDE_CODE",
  roleTitle: "Senior Dev Agent",
  confidence: "HIGH",
  score: 90,
  reasons: ["Matches project stack"],
  risks: []
};

describe("WorkOrdersPage — Project Context (M17E-2)", () => {
  it("renders the Work Orders page", async () => {
    setUser("KING");
    mockBaseApi(makeContext("FRESH"));

    renderPage();

    expect(await screen.findByRole("heading", { name: "Work Orders" })).toBeInTheDocument();
    expect(screen.getByText("Work Queue")).toBeInTheDocument();
  });

  it("shows the Project Context panel with binding details for a FRESH binding", async () => {
    setUser("KING");
    mockBaseApi(makeContext("FRESH"));

    renderPage();
    await selectOrder();

    expect(await screen.findByText("Project Context")).toBeInTheDocument();
    expect(screen.getAllByText("Context: FRESH").length).toBeGreaterThan(0);
    expect(screen.getByText("Local snapshot: snap-1")).toBeInTheDocument();
    expect(screen.getByText("Stack: Express, TypeScript")).toBeInTheDocument();
    expect(screen.getByText(/Important docs: README\.md/)).toBeInTheDocument();
    expect(screen.queryByText(/SANDBOX_PATCH jobs are blocked/)).not.toBeInTheDocument();
  });

  it("selected work order shows Next Step card and source-of-truth links", async () => {
    setUser("KING");
    mockBaseApi(makeContext("FRESH"));

    renderPage();
    await selectOrder();

    expect(await screen.findByText("Next Step")).toBeInTheDocument();
    expect(screen.getAllByText("Assign external agent").length).toBeGreaterThan(0);

    const links = Array.from(document.querySelectorAll("a")).map((link) => ({
      text: link.textContent ?? "",
      href: link.getAttribute("href")
    }));
    expect(links.some((link) => link.text.includes("Project context") && link.href === "/projects/proj-1")).toBe(true);
    expect(links.some((link) => link.text.includes("Automation jobs") && link.href === "/automation-jobs")).toBe(true);
    expect(links.some((link) => link.text.includes("External agent") && link.href === "/external-agents")).toBe(true);
    expect(links.some((link) => link.text.includes("Reports") && link.href === "#work-order-history")).toBe(true);
  });

  it("renders a stale context warning when the binding is STALE", async () => {
    setUser("KING");
    mockBaseApi(makeContext("STALE"));

    renderPage();
    await selectOrder();

    expect((await screen.findAllByText("Context: STALE")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Context is STALE — SANDBOX_PATCH jobs are blocked/)).toBeInTheDocument();
    expect(screen.getAllByText(/Refresh context from the latest scanned local docs before creating a patch job/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Create Automation Job" })).toBeDisabled();
    expect(screen.getAllByText(/Blocked: context is STALE/).length).toBeGreaterThan(0);
  });

  it("lets the KING bind/refresh and mark context stale", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    mockBaseApi(makeContext("MISSING"));
    apiMocks.bindWorkOrderContext.mockResolvedValue({ workOrder: mockOrder, binding: null });
    apiMocks.markWorkOrderContextStale.mockResolvedValue({ workOrder: mockOrder });

    renderPage();
    await selectOrder();

    const refreshButtons = await screen.findAllByRole("button", { name: "Refresh Context" });
    expect(refreshButtons.length).toBeGreaterThan(0);
    await userEvent.click(refreshButtons[0]!);
    await waitFor(() => expect(apiMocks.refreshWorkOrderContext).toHaveBeenCalledWith("wo-1"));

    await userEvent.click(screen.getByRole("button", { name: "Mark Context Stale" }));
    await waitFor(() => expect(apiMocks.markWorkOrderContextStale).toHaveBeenCalledWith("wo-1", expect.any(String)));
  });

  it("hides bind/mark-stale controls from a SCRIBE", async () => {
    setUser("SCRIBE");
    mockBaseApi(makeContext("FRESH"));

    renderPage();
    await selectOrder();

    expect(await screen.findByText("Project Context")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh Context" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Context Stale" })).not.toBeInTheDocument();
  });

  it("shows the Base Context Used panel with a stale warning and risk zones on patch review", async () => {
    setUser("KING");
    mockBaseApi(makeContext("FRESH"), [mockPatch]);

    renderPage();
    await selectOrder();

    expect(await screen.findByText("Base Context Used")).toBeInTheDocument();
    expect(screen.getByText(/Patch was created from STALE project context/)).toBeInTheDocument();
    expect(screen.getByText("Local docs snapshot: snap-1")).toBeInTheDocument();
    expect(screen.getByText(/Risk zones touched: apps\/api\/src\/services\/authService\.ts \(HIGH\)/)).toBeInTheDocument();
  });

  it("shows local docs scan guidance when localDocsChanged is true", async () => {
    setUser("KING");
    const staleWithLocalDocsChanged: WorkOrderContextDto = {
      ...makeContext("STALE"),
      current: {
        status: "STALE",
        lines: ["Context is STALE."],
        binding: {
          status: "STALE",
          projectId: "proj-1",
          localDocumentSnapshotId: "snap-old",
          repositorySnapshotId: null,
          localSnapshotScannedAt: new Date().toISOString(),
          repositoryCommitSha: null,
          repositoryBranch: null,
          detectedStack: [],
          packageScripts: {},
          riskZones: [],
          importantDocs: [],
          rootIds: [],
          rootNames: [],
          rootPathHashes: [],
          localDocsChanged: true,
          warnings: []
        }
      }
    };
    mockBaseApi(staleWithLocalDocsChanged);

    renderPage();
    await selectOrder();

    expect((await screen.findAllByText(/Run a local docs scan on the linked project/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Repair Context" })).not.toBeInTheDocument();
  });

  it("shows Refresh Context guidance when context is STALE but localDocsChanged is false", async () => {
    setUser("KING");
    const staleRepairable: WorkOrderContextDto = {
      ...makeContext("STALE"),
      current: {
        status: "STALE",
        lines: ["Context is STALE."],
        binding: {
          status: "STALE",
          projectId: "proj-1",
          localDocumentSnapshotId: "snap-1",
          repositorySnapshotId: null,
          localSnapshotScannedAt: new Date().toISOString(),
          repositoryCommitSha: null,
          repositoryBranch: null,
          detectedStack: [],
          packageScripts: {},
          riskZones: [],
          importantDocs: [],
          rootIds: [],
          rootNames: [],
          rootPathHashes: [],
          localDocsChanged: false,
          warnings: []
        }
      }
    };
    mockBaseApi(staleRepairable);
    apiMocks.rebindWorkOrderContext.mockResolvedValue({ result: { workOrderId: "wo-1", status: "BOUND", previousStatus: "STALE", newStatus: "FRESH" } });

    renderPage();
    await selectOrder();

    // Wait for the context badge to confirm the panel has rendered
    expect((await screen.findAllByText("Context: STALE")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Context is STALE — SANDBOX_PATCH jobs are blocked/)).toBeInTheDocument();
    expect(screen.queryByText(/Local docs changed since last scan/)).not.toBeInTheDocument();
    expect((await screen.findAllByRole("button", { name: "Refresh Context" })).length).toBeGreaterThan(0);
  });
});

describe("WorkOrdersPage — Use This Agent (M18A-4)", () => {
  it("clicking 'Use This Agent' calls assignWorkOrderExternalAgent with the agent id", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    mockBaseApi(makeContext("FRESH"));
    apiMocks.getWorkOrderRecommendations.mockResolvedValue({ recommendations: [mockRec] });
    apiMocks.assignWorkOrderExternalAgent.mockResolvedValue({
      workOrder: { ...mockOrder, assignedExternalAgentId: "agent-1", assignedExternalAgent: { id: "agent-1", name: "Claude Code" } }
    });

    renderPage();
    await selectOrder();

    await userEvent.click(await screen.findByRole("button", { name: "Use This Agent" }));
    await waitFor(() =>
      expect(apiMocks.assignWorkOrderExternalAgent).toHaveBeenCalledWith("wo-1", "agent-1")
    );
  });

  it("shows success message 'Assigned to <name>' after persisting", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    mockBaseApi(makeContext("FRESH"));
    apiMocks.getWorkOrderRecommendations.mockResolvedValue({ recommendations: [mockRec] });
    apiMocks.assignWorkOrderExternalAgent.mockResolvedValue({
      workOrder: { ...mockOrder, assignedExternalAgentId: "agent-1" }
    });

    renderPage();
    await selectOrder();

    await userEvent.click(await screen.findByRole("button", { name: "Use This Agent" }));
    await screen.findByText("Assigned to Claude Code");
  });

  it("shows error message when assignWorkOrderExternalAgent fails", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    mockBaseApi(makeContext("FRESH"));
    apiMocks.getWorkOrderRecommendations.mockResolvedValue({ recommendations: [mockRec] });
    apiMocks.assignWorkOrderExternalAgent.mockRejectedValue(new Error("Server error assigning agent"));

    renderPage();
    await selectOrder();

    await userEvent.click(await screen.findByRole("button", { name: "Use This Agent" }));
    await screen.findByText("Server error assigning agent");
  });

  it("hides 'Use This Agent' button from SCRIBE", async () => {
    setUser("SCRIBE");
    mockBaseApi(makeContext("FRESH"));
    apiMocks.getWorkOrderRecommendations.mockResolvedValue({ recommendations: [mockRec] });

    renderPage();
    await selectOrder();

    await screen.findByText("Suggested External Agent");
    expect(screen.queryByRole("button", { name: "Use This Agent" })).not.toBeInTheDocument();
  });
});

describe("WorkOrdersPage — Archive as Completed (M18A-4)", () => {
  it("shows 'Archive as Completed' button for KING on a non-archived work order", async () => {
    setUser("KING");
    mockBaseApi(makeContext("FRESH"));

    renderPage();
    await selectOrder();

    expect(await screen.findByRole("button", { name: "Archive as Completed" })).toBeInTheDocument();
  });

  it("shows 'Archive as Completed' button for CROWN_PRINCE (canCreate)", async () => {
    setUser("CROWN_PRINCE");
    mockBaseApi(makeContext("FRESH"));

    renderPage();
    await selectOrder();

    expect(await screen.findByRole("button", { name: "Archive as Completed" })).toBeInTheDocument();
  });

  it("hides 'Archive as Completed' button from MINISTER", async () => {
    setUser("MINISTER");
    mockBaseApi(makeContext("FRESH"));

    renderPage();
    await selectOrder();

    await screen.findByText("Overview");
    expect(screen.queryByRole("button", { name: "Archive as Completed" })).not.toBeInTheDocument();
  });

  it("clicking 'Archive as Completed' calls archiveWorkOrderAsCompleted after confirmation", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    mockBaseApi(makeContext("FRESH"));
    apiMocks.archiveWorkOrderAsCompleted.mockResolvedValue({
      workOrder: { ...mockOrder, status: "ARCHIVED", workQuality: "COMPLETED_ARCHIVE", archiveReason: "Manually archived as completed by King" }
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPage();
    await selectOrder();

    await userEvent.click(await screen.findByRole("button", { name: "Archive as Completed" }));
    await waitFor(() =>
      expect(apiMocks.archiveWorkOrderAsCompleted).toHaveBeenCalledWith("wo-1")
    );
    vi.restoreAllMocks();
  });

  it("does NOT archive when user cancels the confirmation dialog", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    mockBaseApi(makeContext("FRESH"));
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderPage();
    await selectOrder();

    await userEvent.click(await screen.findByRole("button", { name: "Archive as Completed" }));
    expect(apiMocks.archiveWorkOrderAsCompleted).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("hides 'Archive as Completed' button when work order is already ARCHIVED", async () => {
    setUser("KING");
    const archivedOrder: WorkOrderDto = { ...mockOrder, status: "ARCHIVED" };
    apiMocks.workOrders.mockResolvedValue({ workOrders: [archivedOrder], hiddenCount: 0 });
    apiMocks.externalAgents.mockResolvedValue({ externalAgents: [] });
    apiMocks.projects.mockResolvedValue({ projects: [] });
    apiMocks.automationJobs.mockResolvedValue([]);
    apiMocks.patchArtifacts.mockResolvedValue([]);
    apiMocks.getWorkOrderContext.mockResolvedValue({ context: makeContext("MISSING") });
    apiMocks.getWorkOrderRecommendations.mockResolvedValue({ recommendations: [] });
    apiMocks.rebindWorkOrderContext.mockResolvedValue({ result: { workOrderId: "wo-1", status: "BOUND", previousStatus: "MISSING", newStatus: "FRESH" } });
    apiMocks.reconcileContextWarnings.mockResolvedValue({ result: { totalInspected: 0, archived: 0, contextRepaired: 0, skipped: 0, results: [] } });

    renderPage();
    await screen.findByText("Fix the drawbridge");
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.click(screen.getByText("Fix the drawbridge"));

    await screen.findByText("Overview");
    expect(screen.queryByRole("button", { name: "Archive as Completed" })).not.toBeInTheDocument();
  });
});
