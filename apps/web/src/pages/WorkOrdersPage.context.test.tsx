import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PatchArtifactDto, PublicUser, WorkOrderContextDto, WorkOrderDto } from "@/types/api";
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
  rebindWorkOrderContext: vi.fn()
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
}

async function selectOrder() {
  const { default: userEvent } = await import("@testing-library/user-event");
  await userEvent.click(await screen.findByText("Fix the drawbridge"));
}

afterEach(() => {
  vi.clearAllMocks();
  currentUser = null;
});

describe("WorkOrdersPage — Project Context (M17E-2)", () => {
  it("shows the Project Context panel with binding details for a FRESH binding", async () => {
    setUser("KING");
    mockBaseApi(makeContext("FRESH"));

    render(<WorkOrdersPage />);
    await selectOrder();

    expect(await screen.findByText("Project Context")).toBeInTheDocument();
    expect(screen.getByText("Context: FRESH")).toBeInTheDocument();
    expect(screen.getByText("Local snapshot: snap-1")).toBeInTheDocument();
    expect(screen.getByText("Stack: Express, TypeScript")).toBeInTheDocument();
    expect(screen.getByText(/Important docs: README\.md/)).toBeInTheDocument();
    expect(screen.queryByText(/SANDBOX_PATCH jobs are blocked/)).not.toBeInTheDocument();
  });

  it("renders a stale context warning when the binding is STALE", async () => {
    setUser("KING");
    mockBaseApi(makeContext("STALE"));

    render(<WorkOrdersPage />);
    await selectOrder();

    expect(await screen.findByText("Context: STALE")).toBeInTheDocument();
    expect(screen.getByText(/Context is STALE — SANDBOX_PATCH jobs are blocked/)).toBeInTheDocument();
  });

  it("lets the KING bind/refresh and mark context stale", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    mockBaseApi(makeContext("MISSING"));
    apiMocks.bindWorkOrderContext.mockResolvedValue({ workOrder: mockOrder, binding: null });
    apiMocks.markWorkOrderContextStale.mockResolvedValue({ workOrder: mockOrder });

    render(<WorkOrdersPage />);
    await selectOrder();

    await userEvent.click(await screen.findByRole("button", { name: "Bind/Refresh Context" }));
    await waitFor(() => expect(apiMocks.bindWorkOrderContext).toHaveBeenCalledWith("wo-1"));

    await userEvent.click(screen.getByRole("button", { name: "Mark Context Stale" }));
    await waitFor(() => expect(apiMocks.markWorkOrderContextStale).toHaveBeenCalledWith("wo-1", expect.any(String)));
  });

  it("hides bind/mark-stale controls from a SCRIBE", async () => {
    setUser("SCRIBE");
    mockBaseApi(makeContext("FRESH"));

    render(<WorkOrdersPage />);
    await selectOrder();

    expect(await screen.findByText("Project Context")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bind/Refresh Context" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Context Stale" })).not.toBeInTheDocument();
  });

  it("shows the Base Context Used panel with a stale warning and risk zones on patch review", async () => {
    setUser("KING");
    mockBaseApi(makeContext("FRESH"), [mockPatch]);

    render(<WorkOrdersPage />);
    await selectOrder();

    expect(await screen.findByText("Base Context Used")).toBeInTheDocument();
    expect(screen.getByText(/Patch was created from STALE project context/)).toBeInTheDocument();
    expect(screen.getByText("Local docs snapshot: snap-1")).toBeInTheDocument();
    expect(screen.getByText(/Risk zones touched: apps\/api\/src\/services\/authService\.ts \(HIGH\)/)).toBeInTheDocument();
  });
});
