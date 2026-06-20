import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CouncilSessionDto, ReportDto } from "@/types/api";
import { LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import { CouncilPage } from "./CouncilPage";

const nowIso = new Date().toISOString();

const apiMocks = vi.hoisted(() => ({
  planCouncilWorkOrder: vi.fn()
}));

const storeState = vi.hoisted(() => ({
  councilSessions: [] as CouncilSessionDto[],
  reports: [] as ReportDto[]
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

vi.mock("@/stores/kingdomStore", () => ({
  useKingdomStore: (selector: (state: typeof storeState) => unknown) => selector(storeState)
}));

function makeSession(id: string, title: string, command: string): CouncilSessionDto {
  return {
    id,
    taskId: `task-${id}`,
    projectId: "project-1",
    status: "COMPLETED",
    selectedAgentIds: ["agent-1"],
    finalSummary: `Final recommendation for ${title}.`,
    finalTraceId: `trace-${id}`,
    providerName: "openai",
    modelUsed: "gpt-4.1",
    fallbackNotice: null,
    consultedMemoryIds: ["memory-1"],
    autoSavedMemoryIds: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    task: {
      id: `task-${id}`,
      title,
      command,
      mode: "BUILD",
      status: "COMPLETED",
      projectId: "project-1",
      createdBy: "user-1",
      createdAt: nowIso,
      updatedAt: nowIso,
      sessions: [],
      reports: []
    },
    reports: [],
    responses: [{
      id: `response-${id}`,
      sessionId: id,
      agentId: "agent-1",
      role: "Royal Architect",
      response: `Detailed architecture evidence for ${title}.`,
      traceId: `response-trace-${id}`,
      createdAt: nowIso,
      agent: {
        id: "agent-1",
        name: "Cassian",
        title: "Royal Architect",
        specialty: "System architecture"
      } as never
    }]
  };
}

function renderPage(sessions: CouncilSessionDto[]) {
  storeState.councilSessions = sessions;
  storeState.reports = [];
  apiMocks.planCouncilWorkOrder.mockResolvedValue({
    drafted: 1,
    skipped: 0,
    sessionId: sessions[0]?.id ?? "session-1",
    draftedWorkOrderIds: ["work-order-1"],
    createdWorkOrder: { id: "work-order-1" },
    traceId: "planner-trace-1"
  });

  return render(
    <MemoryRouter>
      <CouncilPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  storeState.councilSessions = [];
  storeState.reports = [];
});

describe("CouncilPage", () => {
  it("renders a selected session rail and source-linked evidence pane", async () => {
    const first = makeSession("session-1", "Build the launch plan", "Prepare a launch implementation plan.");
    first.reports = [{ id: "report-1", title: "Launch report" } as never];
    renderPage([first, makeSession("session-2", "Review provider routing", "Audit provider routing evidence.")]);

    expect(screen.getByTestId("council-master-detail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Build the launch plan/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Prepare a launch implementation plan.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Throne Room" })).toHaveAttribute("href", "/throne-room?view=command");
    expect(screen.getByRole("link", { name: "Project context" })).toHaveAttribute("href", "/projects/project-1");
    expect(screen.getByRole("link", { name: "Royal report" })).toHaveAttribute("href", "/reports");
    expect(screen.getByRole("link", { name: "Synthesis trace" })).toHaveAttribute("href", "/usage-traces/trace-session-1");

    expect(screen.getByText("Detailed architecture evidence for Build the launch plan.")).not.toBeVisible();
    await userEvent.click(screen.getByText("Royal Architect"));
    expect(screen.getByText("Detailed architecture evidence for Build the launch plan.")).toBeInTheDocument();
  });

  it("changes the evidence pane when a different session is selected", async () => {
    renderPage([
      makeSession("session-1", "Build the launch plan", "Prepare a launch implementation plan."),
      makeSession("session-2", "Review provider routing", "Audit provider routing evidence.")
    ]);

    await userEvent.click(screen.getByRole("button", { name: /Review provider routing/i }));

    expect(screen.getByRole("button", { name: /Review provider routing/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Audit provider routing evidence.")).toBeInTheDocument();
  });

  it("keeps work-order creation explicit", async () => {
    renderPage([makeSession("session-1", "Build the launch plan", "Prepare a launch implementation plan.")]);

    await userEvent.click(screen.getByRole("button", { name: "Create Work Order" }));

    await waitFor(() => expect(apiMocks.planCouncilWorkOrder).toHaveBeenCalledWith("session-1"));
    expect(await screen.findByText("1 work order created")).toBeInTheDocument();
  });

  it("links the empty archive back to command entry", () => {
    renderPage([]);

    expect(screen.getByText("No council sessions")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Issue first decree/i })).toHaveAttribute("href", "/throne-room?view=command");
  });

  it("renders the refined archive chrome in Thai", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "th");
    renderPage([]);

    expect(screen.getByRole("heading", { name: "บันทึกสภา" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ประวัติการประชุม" })).toBeInTheDocument();
    expect(screen.getByText("ยังไม่มีการประชุมสภา")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ออกพระราชโองการแรก/i })).toHaveAttribute("href", "/throne-room?view=command");
  });
});
