import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type { ExternalAgentDto, ExternalAgentReadinessReportDto, PublicUser } from "@/types/api";
import { ExternalAgentsPage } from "./ExternalAgentsPage";

const nowIso = "2026-06-23T08:00:00.000Z";

function agent(id: string, name: string, overrides: Partial<ExternalAgentDto> = {}): ExternalAgentDto {
  return {
    id, name, type: "CODEX", roleTitle: "Executor", description: "Source-owned registry description",
    capabilities: ["code-review", "testing"], executionMode: "API", command: "codex exec {promptFile}",
    workingDirectory: null, environmentProfile: null, isActive: true, bridgeEnabled: true,
    maxRuntimeSeconds: 900, requiresApproval: true, safetyLevel: "MEDIUM_RISK",
    createdAt: nowIso, updatedAt: nowIso, ...overrides,
  };
}

const apiMocks = vi.hoisted(() => ({
  externalAgents: vi.fn(),
  externalAgentReadiness: vi.fn(),
  createExternalAgent: vi.fn(),
  updateExternalAgent: vi.fn(),
  testExternalAgent: vi.fn(),
  deleteExternalAgent: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser }),
}));

afterEach(() => {
  vi.clearAllMocks();
  currentUser = null;
  localStorage.clear();
});

function setup(options: { role?: PublicUser["role"]; agents?: ExternalAgentDto[]; runnerOnline?: boolean } = {}) {
  currentUser = { id: "u1", email: "king@aikingdom.local", displayName: "King", role: options.role ?? "KING" };
  const agents = options.agents ?? [
    agent("a1", "Claude Code", { type: "CLAUDE_CODE" }),
    agent("a2", "Manual Reviewer", { type: "MANUAL_ONLY", executionMode: "MANUAL_COPY_PASTE", bridgeEnabled: false, command: null }),
  ];
  const report: ExternalAgentReadinessReportDto = {
    runnerOnline: options.runnerOnline ?? true,
    capabilitiesUpdatedAt: options.runnerOnline === false ? null : nowIso,
    agents: agents.filter((entry) => entry.isActive).map((entry) => ({
      agentId: entry.id,
      name: entry.name,
      type: entry.type,
      ready: entry.id === "a1" && options.runnerOnline !== false,
      configReady: entry.id === "a1",
      runnerAvailable: entry.id === "a1" && options.runnerOnline !== false,
      lastRunStatus: entry.id === "a1" ? "SUCCEEDED" : null,
      reason: entry.id === "a1" && options.runnerOnline !== false ? "ready" : "CLI not available on the runner host right now",
    })),
  };
  apiMocks.externalAgents.mockResolvedValue({ externalAgents: agents });
  apiMocks.externalAgentReadiness.mockResolvedValue(report);
  apiMocks.createExternalAgent.mockImplementation(async (payload) => {
    const created = agent("a3", payload.name, payload);
    agents.push(created);
    return { externalAgent: created };
  });
  apiMocks.updateExternalAgent.mockImplementation(async (id, payload) => {
    const updated = { ...agents.find((entry) => entry.id === id)!, ...payload };
    const index = agents.findIndex((entry) => entry.id === id);
    agents[index] = updated;
    return { externalAgent: updated };
  });
  apiMocks.deleteExternalAgent.mockImplementation(async (id) => {
    const updated = { ...agents.find((entry) => entry.id === id)!, isActive: false };
    const index = agents.findIndex((entry) => entry.id === id);
    agents[index] = updated;
    return { externalAgent: updated };
  });
  apiMocks.testExternalAgent.mockResolvedValue({ test: { status: "READY", issues: [], prompt: "validation prompt", commandTemplate: "codex exec {promptFile}", maxRuntimeSeconds: 900, captures: ["stdout"] } });
}

function renderPage(language: "en" | "th" = "en") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  return render(<I18nProvider><MemoryRouter><ExternalAgentsPage /></MemoryRouter></I18nProvider>);
}

describe("ExternalAgentsPage registry workspace", () => {
  it("shows compact metrics, live readiness evidence, and the selected source-owned detail", async () => {
    setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "External agents" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "External agent registry" })).toBeInTheDocument();
    expect(screen.getByTestId("runner-readiness")).toHaveTextContent("Runner online");
    expect(screen.getAllByText("Claude Code").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Source-owned registry description").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ready").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Capabilities" }));
    expect(screen.getByText("SUCCEEDED")).toBeInTheDocument();
  });

  it("keeps source links in their owning routes", async () => {
    setup();
    renderPage();
    await screen.findByRole("heading", { name: "External agents" });

    await userEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(screen.getByRole("link", { name: /Work Orders/ })).toHaveAttribute("href", "/work-orders");
    expect(screen.getByRole("link", { name: /Automation Jobs/ })).toHaveAttribute("href", "/automation-jobs");
    expect(screen.getByRole("link", { name: /Matters/ })).toHaveAttribute("href", "/matters");
  });

  it("opens explicit create and edit dialogs instead of an always-visible form", async () => {
    setup();
    renderPage();
    await screen.findByRole("heading", { name: "External agents" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create external agent" }));
    const createDialog = screen.getByRole("dialog", { name: "Create external agent" });
    await userEvent.type(within(createDialog).getByLabelText("Name"), "New Executor");
    await userEvent.type(within(createDialog).getByLabelText("Role title"), "Build specialist");
    await userEvent.click(within(createDialog).getByRole("button", { name: "Save external agent" }));
    await waitFor(() => expect(apiMocks.createExternalAgent).toHaveBeenCalledWith(expect.objectContaining({ name: "New Executor", roleTitle: "Build specialist" })));

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editDialog = screen.getByRole("dialog", { name: "Edit New Executor" });
    expect(within(editDialog).getByLabelText("Name")).toHaveValue("New Executor");
  });

  it("requires a confirmation before the soft-delete endpoint is called", async () => {
    setup();
    renderPage();
    await screen.findByRole("heading", { name: "External agents" });

    await userEvent.click(screen.getByRole("button", { name: "Deactivate record" }));
    const dialog = screen.getByRole("dialog", { name: "Deactivate Claude Code?" });
    expect(dialog).toHaveTextContent("soft delete");
    expect(apiMocks.deleteExternalAgent).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate agent" }));
    await waitFor(() => expect(apiMocks.deleteExternalAgent).toHaveBeenCalledWith("a1"));
  });

  it("uses the update endpoint for an explicit active-state change", async () => {
    setup();
    renderPage();
    await screen.findByRole("heading", { name: "External agents" });

    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(apiMocks.updateExternalAgent).toHaveBeenCalledWith("a1", { isActive: false }));
  });

  it("labels validation as configuration-only and renders endpoint evidence", async () => {
    setup();
    renderPage();
    await screen.findByRole("heading", { name: "External agents" });

    await userEvent.click(screen.getByRole("button", { name: "Validation" }));
    expect(screen.getByText(/does not execute a command or change files/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Test configuration" }));
    await waitFor(() => expect(apiMocks.testExternalAgent).toHaveBeenCalledWith("a1"));
    expect(screen.getByText("Configuration test: READY")).toBeInTheDocument();
    expect(screen.getByText(/codex exec/)).toBeInTheDocument();
  });

  it("keeps registry mutations hidden for a Crown Prince", async () => {
    setup({ role: "CROWN_PRINCE" });
    renderPage();
    await screen.findByRole("heading", { name: "External agents" });

    expect(screen.queryByRole("button", { name: "Create external agent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByText("Registry controls are available to the King only.")).toBeInTheDocument();
  });

  it("uses semantic Thai chrome without translating server-provided names or reasons", async () => {
    setup({ runnerOnline: false });
    renderPage("th");

    expect(await screen.findByRole("heading", { name: "เอเจนต์ภายนอก" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "สร้างเอเจนต์ภายนอก" })).toBeInTheDocument();
    expect(screen.getByTestId("runner-readiness")).toHaveTextContent("ไม่มี Runner ออนไลน์");
    expect(screen.getAllByText("Claude Code").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CLI not available on the runner host right now").length).toBeGreaterThan(0);
  });
});
