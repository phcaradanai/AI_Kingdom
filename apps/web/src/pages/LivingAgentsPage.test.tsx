import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type { AgentPresenceDto, LivingAgentSummaryDto } from "@/types/api";
import { LivingAgentsPage } from "./LivingAgentsPage";

const nowIso = "2026-06-23T09:00:00.000Z";

function agent(id: string, overrides: Partial<LivingAgentSummaryDto> = {}): LivingAgentSummaryDto {
  return {
    id,
    slug: id,
    name: id === "agent-1" ? "Aurelian" : "Seraphine",
    title: id === "agent-1" ? "Grand Vizier" : "Royal Architect",
    role: id === "agent-1" ? "GRAND_VIZIER" : "ROYAL_ARCHITECT",
    specialty: "Canonical specialty",
    description: "Source-owned agent description",
    isActive: true,
    priority: 1,
    preferredProviderId: null,
    defaultModel: "deepseek/v4",
    displayName: null,
    displayTitle: null,
    avatarUrl: null,
    avatarVersion: 1,
    canonicalName: null,
    canonicalTitle: null,
    coreSlug: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    currentStatus: id === "agent-1" ? "RESPONDING" : "IDLE",
    lastActivityAt: nowIso,
    lastActivityTitle: id === "agent-1" ? "Council synthesis" : null,
    totalCalls: id === "agent-1" ? 42 : 8,
    totalTokens: 12000,
    totalEstimatedCostUSD: 0.12,
    tokensToday: id === "agent-1" ? 2400 : 0,
    costToday: id === "agent-1" ? 0.024 : 0,
    trustedTraceCount: id === "agent-1" ? 4 : 0,
    partialTraceCount: 0,
    legacyUnattributedCount: id === "agent-1" ? 0 : 2,
    linkedProjectCount: 1,
    providerSummary: [{ provider: "openrouter", callCount: 42, totalCostUSD: 0.12 }],
    modelSummary: [{ model: "deepseek/v4", callCount: 42 }],
    topOperations: [{ operation: "council", count: 12 }],
    ...overrides,
  };
}

function presence(id: string, overrides: Partial<AgentPresenceDto> = {}): AgentPresenceDto {
  const source = agent(id);
  return {
    id,
    slug: source.slug,
    name: source.name,
    title: source.title,
    role: source.role,
    displayName: source.displayName,
    displayTitle: source.displayTitle,
    avatarUrl: source.avatarUrl,
    avatarVersion: source.avatarVersion,
    state: id === "agent-1" ? "RUNNING" : "IDLE",
    currentTask: id === "agent-1" ? "Validate the release" : null,
    currentWorkOrder: id === "agent-1" ? { id: "wo-1", title: "Release validation" } : null,
    progress: id === "agent-1" ? "step 2/4" : null,
    blockingReason: null,
    lastActivityAt: nowIso,
    ...overrides,
  };
}

const apiMocks = vi.hoisted(() => ({
  getLivingAgents: vi.fn(),
  getKingdomPresence: vi.fn(),
  getLivingAgentStates: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function setup(options: { loadError?: Error; presenceError?: Error } = {}) {
  if (options.loadError) apiMocks.getLivingAgents.mockRejectedValue(options.loadError);
  else apiMocks.getLivingAgents.mockResolvedValue({ agents: [agent("agent-1"), agent("agent-2")] });

  if (options.presenceError) apiMocks.getKingdomPresence.mockRejectedValue(options.presenceError);
  else apiMocks.getKingdomPresence.mockResolvedValue({ computedAt: nowIso, agents: [presence("agent-1"), presence("agent-2")] });

  // Living state defaults to empty (graceful degradation when unavailable)
  apiMocks.getLivingAgentStates.mockResolvedValue({ states: [] });
}

function renderPage(language: "en" | "th" = "en") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  return render(<I18nProvider><MemoryRouter><LivingAgentsPage /></MemoryRouter></I18nProvider>);
}

describe("LivingAgentsPage operational roster", () => {
  it("renders compact metrics, roster, selected evidence, and canonical sources", async () => {
    setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Living agents" })).toBeInTheDocument();
    expect(screen.getByTestId("living-agent-metrics")).toHaveTextContent("2 agents");
    expect(screen.getByRole("complementary", { name: "Living agent roster" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Selected agent evidence" })).toHaveTextContent("Aurelian");
    expect(screen.getByRole("link", { name: "Open living profile" })).toHaveAttribute("href", "/living-agents/agent-1");
    expect(screen.getByRole("link", { name: "Open agent registry" })).toHaveAttribute("href", "/agents");
    expect(screen.getByRole("link", { name: "Open Work Order Release validation" })).toHaveAttribute("href", "/work-orders?focus=wo-1");
  });

  it("switches selection and exposes real blocking evidence without inferring work", async () => {
    setup();
    apiMocks.getKingdomPresence.mockResolvedValue({
      computedAt: nowIso,
      agents: [presence("agent-1"), presence("agent-2", { state: "BLOCKED", blockingReason: "Automation job failed" })],
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Select Royal Architect" }));
    const detail = screen.getByRole("region", { name: "Selected agent evidence" });
    expect(detail).toHaveTextContent("Blocked");
    expect(detail).toHaveTextContent("Automation job failed");
    expect(detail).toHaveTextContent("No current Work Order reported");
  });

  it("filters by operational state and role", async () => {
    setup();
    renderPage();

    await screen.findByRole("heading", { name: "Living agents" });
    await userEvent.selectOptions(screen.getByLabelText("Operational state"), "active");
    const roster = screen.getByRole("complementary", { name: "Living agent roster" });
    expect(within(roster).getByText("Grand Vizier")).toBeInTheDocument();
    expect(within(roster).queryByText("Royal Architect")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Operational state"), "all");
    await userEvent.selectOptions(screen.getByLabelText("Agent role"), "ROYAL_ARCHITECT");
    expect(within(roster).getByText("Royal Architect")).toBeInTheDocument();
    expect(within(roster).queryByText("Grand Vizier")).not.toBeInTheDocument();
  });

  it("keeps an explicit roster/detail handoff for bounded tablet and mobile layouts", async () => {
    setup();
    renderPage();

    const navigation = await screen.findByRole("navigation", { name: "Living agent panes" });
    expect(within(navigation).getByRole("button", { name: "Roster" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Select Royal Architect" }));
    expect(within(navigation).getByRole("button", { name: "Details" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(navigation).getByRole("button", { name: "Roster" }));
    expect(within(navigation).getByRole("button", { name: "Roster" })).toHaveAttribute("aria-pressed", "true");
  });

  it("degrades to roster evidence when Kingdom Presence is not authorized", async () => {
    setup({ presenceError: new Error("Forbidden") });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Living agents" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Selected agent evidence" })).toHaveTextContent("Live assignment unavailable; roster evidence remains available");
  });

  it("shows errors and semantic Thai chrome while preserving source-owned identity", async () => {
    setup({ loadError: new Error("Roster unavailable") });
    const { unmount } = renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Roster unavailable");
    unmount();

    vi.clearAllMocks();
    setup();
    renderPage("th");
    expect(await screen.findByRole("heading", { name: "เอเจนต์มีชีวิต" })).toBeInTheDocument();
    expect(screen.getByLabelText("สถานะการทำงาน")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เลือก Royal Architect" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "หลักฐานเอเจนต์ที่เลือก" })).toHaveTextContent("Aurelian");
  });
});
