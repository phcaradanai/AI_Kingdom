import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type { DirectAgentSessionDto, DirectAgentSummaryDto, ProjectDto } from "@/types/api";
import { AgentChatPage } from "./AgentChatPage";

const nowIso = "2026-06-23T09:00:00.000Z";

const aurelian: DirectAgentSummaryDto = {
  id: "agent-1",
  slug: "grand-vizier",
  name: "Aurelian",
  title: "Grand Vizier",
  role: "GRAND_VIZIER",
  specialty: "Council synthesis",
  description: "Canonical agent description",
  skills: ["planning"],
  isActive: true,
  displayName: null,
  displayTitle: null,
  avatarUrl: null,
  avatarVersion: 1,
};

const seraphine: DirectAgentSummaryDto = {
  ...aurelian,
  id: "agent-2",
  slug: "royal-architect",
  name: "Seraphine",
  title: "Royal Architect",
  role: "ROYAL_ARCHITECT",
  specialty: "Technical architecture",
};

const project: ProjectDto = {
  id: "project-1",
  name: "AI Kingdom",
  codename: "kingdom",
  description: "Source-owned project description",
  status: "ACTIVE",
  priority: "HIGH",
  goals: [],
  keywords: [],
  aliases: [],
  repositoryUrl: null,
  localPath: null,
  activeMilestone: null,
  ownerUserId: null,
  createdAt: nowIso,
  updatedAt: nowIso,
};

function session(overrides: Partial<DirectAgentSessionDto> = {}): DirectAgentSessionDto {
  return {
    id: "session-1",
    agentId: aurelian.id,
    projectId: project.id,
    createdByUserId: "user-1",
    title: "Plan review",
    requestType: "GENERAL_QUESTION",
    status: "OPEN",
    summary: null,
    latestTraceId: "trace-1",
    latestUsageRecordId: "usage-1",
    artifactId: "artifact-1",
    knowledgeCandidateId: "knowledge-1",
    providerName: "OpenRouter",
    modelUsed: "deepseek/v4",
    fallbackNotice: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    agent: aurelian,
    project: { id: project.id, name: project.name, codename: project.codename },
    messages: [
      { id: "message-1", sessionId: "session-1", agentId: null, role: "USER", content: "Review this plan", traceId: null, usageRecordId: null, metadata: null, createdAt: nowIso },
      { id: "message-2", sessionId: "session-1", agentId: aurelian.id, role: "AGENT", content: "The plan is ready for review.", traceId: "trace-1", usageRecordId: "usage-1", metadata: null, createdAt: nowIso },
    ],
    ...overrides,
  };
}

const apiMocks = vi.hoisted(() => ({
  getDirectAgentOptions: vi.fn(),
  getDirectAgentSessions: vi.fn(),
  getDirectAgentSession: vi.fn(),
  createDirectAgentSession: vi.fn(),
  sendDirectAgentMessage: vi.fn(),
  projects: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function setup(options: { sessions?: DirectAgentSessionDto[]; loadError?: Error } = {}) {
  if (options.loadError) {
    apiMocks.getDirectAgentOptions.mockRejectedValue(options.loadError);
  } else {
    apiMocks.getDirectAgentOptions.mockResolvedValue({ agents: [aurelian, seraphine] });
  }
  apiMocks.getDirectAgentSessions.mockResolvedValue({ sessions: options.sessions ?? [] });
  apiMocks.projects.mockResolvedValue({ projects: [project] });
  apiMocks.getDirectAgentSession.mockResolvedValue({ session: session() });
  apiMocks.createDirectAgentSession.mockResolvedValue({ session: session({ agentId: seraphine.id, agent: seraphine }) });
  apiMocks.sendDirectAgentMessage.mockResolvedValue({ session: session() });
}

function renderPage(language: "en" | "th" = "en") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  return render(<I18nProvider><MemoryRouter><AgentChatPage /></MemoryRouter></I18nProvider>);
}

describe("AgentChatPage workspace", () => {
  it("renders focused pane navigation and source ownership", async () => {
    setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Agent Chat" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Agent Chat panes" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Agent and session browser" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agent registry" })).toHaveAttribute("href", "/agents");
    expect(screen.getByRole("link", { name: "Artifact archive" })).toHaveAttribute("href", "/artifacts");
    expect(screen.getByRole("link", { name: "Knowledge candidates" })).toHaveAttribute("href", "/knowledge-lab/candidates");
  });

  it("loads an existing session and keeps its canonical source links", async () => {
    setup({ sessions: [session({ messages: [] })] });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Sessions" }));
    await userEvent.click(screen.getByRole("button", { name: "Open session Plan review" }));

    await waitFor(() => expect(apiMocks.getDirectAgentSession).toHaveBeenCalledWith("session-1"));
    expect(await screen.findByText("The plan is ready for review.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open usage trace" })).toHaveAttribute("href", "/usage-traces/trace-1");
    expect(screen.getByRole("link", { name: "Open artifact" })).toHaveAttribute("href", "/artifacts");
    expect(screen.getByRole("link", { name: "Open knowledge candidate" })).toHaveAttribute("href", "/knowledge-lab/candidates");
  });

  it("creates a new session with the selected agent, project, request type, and save mode", async () => {
    setup();
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Start a new conversation with Royal Architect" }));
    await userEvent.click(screen.getByRole("button", { name: "Context" }));
    await userEvent.click(screen.getByRole("button", { name: "Research" }));
    await userEvent.type(screen.getByLabelText("Session title"), "Architecture review");
    await userEvent.selectOptions(screen.getByLabelText("Project context"), project.id);
    await userEvent.selectOptions(screen.getByLabelText("Save output"), "BOTH");
    await userEvent.click(screen.getByRole("button", { name: "Conversation" }));
    await userEvent.type(screen.getByLabelText("Message to Royal Architect"), "Review the system boundaries.");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(apiMocks.createDirectAgentSession).toHaveBeenCalledWith({
      agentId: seraphine.id,
      projectId: project.id,
      title: "Architecture review",
      prompt: "Review the system boundaries.",
      requestType: "RESEARCH_ASSIGNMENT",
      saveMode: "BOTH",
    }));
  });

  it("sends a follow-up through the existing session endpoint", async () => {
    setup({ sessions: [session({ messages: [] })] });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Sessions" }));
    await userEvent.click(screen.getByRole("button", { name: "Open session Plan review" }));
    const composer = await screen.findByLabelText("Message to Grand Vizier");
    await userEvent.type(composer, "Add the safest next action.");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(apiMocks.sendDirectAgentMessage).toHaveBeenCalledWith("session-1", {
      prompt: "Add the safest next action.",
      requestType: "GENERAL_QUESTION",
      saveMode: "NONE",
    }));
  });

  it("shows a bounded error state when the workspace cannot load", async () => {
    setup({ loadError: new Error("Direct chat unavailable") });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Direct chat unavailable");
  });

  it("uses Thai chrome while preserving server-owned identity and message data", async () => {
    setup({ sessions: [session()] });
    renderPage("th");

    expect(await screen.findByRole("heading", { name: "แชตเอเจนต์" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "การสนทนา" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เริ่มการสนทนาใหม่กับ Royal Architect" })).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "ตัวเลือกเอเจนต์และเซสชัน" })).getByText("Seraphine")).toBeInTheDocument();
  });
});
