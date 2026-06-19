import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CouncilSessionDto, TaskDto } from "@/types/api";
import { ThroneRoomPage } from "./ThroneRoomPage";

const nowIso = new Date().toISOString();

const apiMocks = vi.hoisted(() => ({
  createCouncilHandoff: vi.fn(),
  executeCouncilWithExternalAgent: vi.fn(),
  planCouncilWorkOrder: vi.fn(),
  // The default "Live Kingdom" view mounts LivingKingdomView, which loads presence + activity.
  getKingdomPresence: vi.fn(),
  getKingdomActivity: vi.fn()
}));

const storeState = vi.hoisted(() => ({
  tasks: [] as TaskDto[],
  settings: [{ key: "COUNCIL_AUTO_WORK_ORDER_MODE", value: "READY" }],
  isLoading: false,
  isProcessing: false,
  submitCommand: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

vi.mock("@/stores/kingdomStore", () => ({
  useKingdomStore: (selector: (state: typeof storeState) => unknown) => selector(storeState)
}));

function makeSession(overrides: Partial<CouncilSessionDto> = {}): CouncilSessionDto {
  return {
    id: "session-1",
    taskId: "task-1",
    projectId: "proj-1",
    status: "COMPLETED",
    selectedAgentIds: [],
    finalSummary: "Final recommendation: Create a tracked implementation work order.",
    finalTraceId: "trace-final",
    providerName: "openai",
    modelUsed: "gpt-4.1",
    fallbackNotice: null,
    consultedMemoryIds: ["memory-1"],
    autoSavedMemoryIds: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    reports: [{
      id: "report-1",
      title: "Council Source Brief",
      summary: "Brief summary",
      content: "Brief content",
      projectId: "proj-1",
      sourceTaskId: "task-1",
      sourceCouncilSessionId: "session-1",
      category: "STRATEGY",
      importance: "HIGH",
      tags: [],
      createdBy: "SYSTEM",
      createdAt: nowIso,
      updatedAt: nowIso
    }],
    responses: [
      {
        id: "response-archivist",
        sessionId: "session-1",
        agentId: "agent-archivist",
        role: "Royal Archivist",
        response: "Short archive summary for scanning.\n\nDetailed archive packet names the ledger to inspect.",
        createdAt: nowIso,
        agent: { title: "Royal Archivist" } as never
      },
      {
        id: "response-researcher",
        sessionId: "session-1",
        agentId: "agent-researcher",
        role: "Royal Researcher",
        response: "Researcher summary names the strongest option.",
        createdAt: nowIso,
        agent: { title: "Royal Researcher" } as never
      }
    ],
    ...overrides
  };
}

function makeTask(session = makeSession()): TaskDto {
  return {
    id: "task-1",
    title: "Build the council handoff flow",
    command: "Prepare the implementation path for the council handoff flow.",
    mode: "BUILD",
    status: "COMPLETED",
    projectId: "proj-1",
    createdBy: "user-1",
    createdAt: nowIso,
    updatedAt: nowIso,
    sessions: [session],
    reports: session.reports ?? []
  };
}

function renderPage(task: TaskDto | null = makeTask()) {
  storeState.tasks = task ? [task] : [];
  storeState.settings = [{ key: "COUNCIL_AUTO_WORK_ORDER_MODE", value: "READY" }];
  storeState.isLoading = false;
  storeState.isProcessing = false;
  storeState.submitCommand.mockResolvedValue(task);
  apiMocks.planCouncilWorkOrder.mockResolvedValue({ drafted: 1, skipped: 0, sessionId: "session-1", draftedWorkOrderIds: ["wo-1"], createdWorkOrder: { id: "wo-1" }, traceId: "trace-1" });
  apiMocks.createCouncilHandoff.mockResolvedValue({
    workOrder: { id: "wo-handoff", contextBindingStatus: "FRESH" },
    handoffBrief: { title: "Council handoff brief" }
  });
  apiMocks.getKingdomPresence.mockResolvedValue({ computedAt: nowIso, agents: [] });
  apiMocks.getKingdomActivity.mockResolvedValue({ computedAt: nowIso, activities: [] });
  apiMocks.executeCouncilWithExternalAgent.mockResolvedValue({
    workOrder: { id: "wo-1" },
    job: { id: "job-1", status: "APPROVED" },
    externalAgentRun: { id: "run-1" },
    externalAgent: { id: "external-agent-1" },
    plannerResult: { drafted: 1, skipped: 0, sessionId: "session-1", draftedWorkOrderIds: ["wo-1"], createdWorkOrder: { id: "wo-1" }, traceId: "trace-1" },
    alreadyScheduled: false,
    message: "External agent execution approved. Runner will claim the job and report back for King review."
  });

  return render(
    <MemoryRouter>
      <ThroneRoomPage />
    </MemoryRouter>
  );
}

// Throne Room opens on the visual Live Kingdom view; the decree/council terminal
// lives under the "Command" toggle. Reveal it before asserting command content.
async function switchToCommand() {
  await userEvent.click(screen.getByRole("button", { name: /^Command$/i }));
}

afterEach(() => {
  vi.clearAllMocks();
  storeState.tasks = [];
  storeState.settings = [];
});

describe("ThroneRoomPage", () => {
  it("renders mode helper text", async () => {
    renderPage(null);
    await switchToCommand();

    expect(screen.getByRole("button", { name: /ASK/i })).toBeInTheDocument();
    expect(screen.getByText("Best when the King needs counsel, not a project plan.")).toBeInTheDocument();
    expect(screen.getByText("Best before a manual external-agent handoff.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Issue Decree/i })).toBeInTheDocument();
  });

  it("shows the final recommendation and Recommended Next Step first for completed councils", async () => {
    renderPage();
    await switchToCommand();

    expect(screen.getByText("Final Recommendation")).toBeInTheDocument();
    expect(screen.getByText("Next Action")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Work Order and Run External Agent/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create External Agent Handoff/i })).not.toBeInTheDocument();
    expect(screen.getByText("Final synthesis ready")).toBeInTheDocument();
  });

  it("collapses and expands role reports", async () => {
    renderPage();
    await switchToCommand();

    expect(screen.getByText("Short archive summary for scanning.")).toBeInTheDocument();
    expect(screen.queryByText(/Detailed archive packet/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Show Royal Archivist details/i }));

    expect(screen.getByText(/Detailed archive packet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hide Royal Archivist details/i })).toBeInTheDocument();
  });

  it("shows context warning as automation-blocking guidance", async () => {
    const session = makeSession({
      finalSummary: "[CONTEXT WARNING]\nProject context is stale.\n\nFinal recommendation: Proceed manually after review."
    });
    renderPage(makeTask(session));
    await switchToCommand();

    expect(screen.getByText("Context Warning - Automation Gate")).toBeInTheDocument();
    expect(screen.getByText(/This warning blocks automation only/)).toBeInTheDocument();
    expect(screen.getByText("Run local docs scan before SANDBOX_PATCH.")).toBeInTheDocument();
    expect(screen.getByText("Run local docs scan before SANDBOX_PATCH")).toBeInTheDocument();
  });

  it("creates a work order and starts external-agent execution through the primary action", async () => {
    renderPage();
    await switchToCommand();

    await userEvent.click(screen.getByRole("button", { name: /Create Work Order and Run External Agent/i }));
    await waitFor(() => expect(apiMocks.executeCouncilWithExternalAgent).toHaveBeenCalledWith("session-1"));
    expect(apiMocks.planCouncilWorkOrder).not.toHaveBeenCalled();
    expect(await screen.findByText("External agent execution approved. Runner will claim the job and report back for King review.")).toBeInTheDocument();
  });

  it("shows a disabled work-order action when planner mode is off", async () => {
    storeState.settings = [{ key: "COUNCIL_AUTO_WORK_ORDER_MODE", value: "OFF" }];
    const session = makeSession({
      nextExecutableAction: "CREATE_WORK_ORDER",
      nextExecutableActionReason: "This council recommendation does not generate executable work orders."
    });
    renderPage(makeTask(session));
    await switchToCommand();

    expect(screen.getByRole("button", { name: /Create Work Order/i })).toBeDisabled();
    expect(screen.getAllByText("This council recommendation does not generate executable work orders.").length).toBeGreaterThan(0);
  });

  it("runs the handoff primary action when the stored next action asks for it", async () => {
    const session = makeSession({
      nextExecutableAction: "CREATE_EXTERNAL_HANDOFF",
      nextExecutableActionReason: "Package this as a manual handoff."
    });
    renderPage(makeTask(session));
    await switchToCommand();

    await userEvent.click(screen.getByRole("button", { name: /Create External Agent Handoff/i }));
    await waitFor(() => expect(apiMocks.createCouncilHandoff).toHaveBeenCalledWith("task-1", "session-1"));
    expect(apiMocks.planCouncilWorkOrder).not.toHaveBeenCalled();
  });

  it("renders source links when source data exists", async () => {
    renderPage();
    await switchToCommand();

    expect(screen.getByRole("link", { name: /Council Record/i })).toHaveAttribute("href", "/council");
    expect(screen.getByRole("link", { name: /Royal Brief/i })).toHaveAttribute("href", "/royal-brief");
    expect(screen.getAllByRole("link", { name: /Project Context/i }).some((link) => link.getAttribute("href") === "/projects/proj-1")).toBe(true);
    expect(screen.getAllByRole("link", { name: /Work Order/i }).some((link) => link.getAttribute("href") === "/work-orders")).toBe(true);
    expect(screen.getByRole("link", { name: /Generated Report/i })).toHaveAttribute("href", "/reports");
    expect(screen.getByRole("link", { name: /Usage Trace/i })).toHaveAttribute("href", "/usage-traces/trace-final");
  });
});
