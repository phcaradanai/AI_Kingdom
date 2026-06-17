import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CouncilSessionDto, TaskDto } from "@/types/api";
import { ThroneRoomPage } from "./ThroneRoomPage";

const nowIso = new Date().toISOString();

const apiMocks = vi.hoisted(() => ({
  createCouncilHandoff: vi.fn(),
  planCouncilWorkOrder: vi.fn()
}));

const storeState = vi.hoisted(() => ({
  tasks: [] as TaskDto[],
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
  storeState.isLoading = false;
  storeState.isProcessing = false;
  storeState.submitCommand.mockResolvedValue(task);
  apiMocks.planCouncilWorkOrder.mockResolvedValue({ drafted: 1, skipped: 0, sessionId: "session-1", draftedWorkOrderIds: ["wo-1"] });
  apiMocks.createCouncilHandoff.mockResolvedValue({
    workOrder: { id: "wo-handoff", contextBindingStatus: "FRESH" },
    handoffBrief: { title: "Council handoff brief" }
  });

  return render(
    <MemoryRouter>
      <ThroneRoomPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  storeState.tasks = [];
});

describe("ThroneRoomPage", () => {
  it("renders mode helper text", () => {
    renderPage(null);

    expect(screen.getByRole("button", { name: /ASK/i })).toBeInTheDocument();
    expect(screen.getByText("Best when the King needs counsel, not a project plan.")).toBeInTheDocument();
    expect(screen.getByText("Best before a manual external-agent handoff.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Issue Decree/i })).toBeInTheDocument();
  });

  it("shows the final recommendation and Recommended Next Step first for completed councils", () => {
    renderPage();

    expect(screen.getByText("Final Recommendation")).toBeInTheDocument();
    expect(screen.getByText("Recommended Next Step")).toBeInTheDocument();
    expect(screen.getByText("Create an implementation handoff")).toBeInTheDocument();
    expect(screen.getByText("Final synthesis ready")).toBeInTheDocument();
  });

  it("collapses and expands role reports", async () => {
    renderPage();

    expect(screen.getByText("Short archive summary for scanning.")).toBeInTheDocument();
    expect(screen.queryByText(/Detailed archive packet/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Show Royal Archivist details/i }));

    expect(screen.getByText(/Detailed archive packet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hide Royal Archivist details/i })).toBeInTheDocument();
  });

  it("shows context warning as automation-blocking guidance", () => {
    const session = makeSession({
      finalSummary: "[CONTEXT WARNING]\nProject context is stale.\n\nFinal recommendation: Proceed manually after review."
    });
    renderPage(makeTask(session));

    expect(screen.getByText("Context Warning - Automation Gate")).toBeInTheDocument();
    expect(screen.getByText(/This warning blocks automation only/)).toBeInTheDocument();
    expect(screen.getByText("Run local docs scan before SANDBOX_PATCH.")).toBeInTheDocument();
    expect(screen.getByText("Run local docs scan before SANDBOX_PATCH")).toBeInTheDocument();
  });

  it("keeps create handoff and create work order buttons working", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /Create Work Order/i }));
    await waitFor(() => expect(apiMocks.planCouncilWorkOrder).toHaveBeenCalledWith("session-1"));
    expect(await screen.findByText("1 work order drafted from the council recommendation.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Create External Agent Handoff/i }));
    await waitFor(() => expect(apiMocks.createCouncilHandoff).toHaveBeenCalledWith("task-1", "session-1"));
    expect(await screen.findByText("External handoff ready: Council handoff brief")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Created Work Order/i })).toHaveAttribute("href", "/work-orders");
  });

  it("renders source links when source data exists", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /Council Record/i })).toHaveAttribute("href", "/council");
    expect(screen.getByRole("link", { name: /Royal Brief/i })).toHaveAttribute("href", "/royal-brief");
    expect(screen.getAllByRole("link", { name: /Project Context/i }).some((link) => link.getAttribute("href") === "/projects/proj-1")).toBe(true);
    expect(screen.getAllByRole("link", { name: /Work Order/i }).some((link) => link.getAttribute("href") === "/work-orders")).toBe(true);
    expect(screen.getByRole("link", { name: /Generated Report/i })).toHaveAttribute("href", "/reports");
    expect(screen.getByRole("link", { name: /Usage Trace/i })).toHaveAttribute("href", "/usage-traces/trace-final");
  });
});
