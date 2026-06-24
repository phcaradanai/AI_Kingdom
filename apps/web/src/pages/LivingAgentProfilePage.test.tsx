import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type {
  KnowledgeCandidateDto,
  KnowledgeMemoryDto,
  LivingAgentProfileDto,
  LivingAgentRelationsDto,
  LivingAgentTimelineItemDto,
} from "@/types/api";
import { LivingAgentProfilePage } from "./LivingAgentProfilePage";

const nowIso = "2026-06-24T09:00:00.000Z";

const timelineItem: LivingAgentTimelineItemDto = {
  id: "timeline-1",
  type: "TRACE",
  title: "Council synthesis",
  detail: "Source-owned timeline detail",
  timestamp: nowIso,
  status: "COMPLETED",
  attributionStatus: "TRUSTED",
  projectId: "project-1",
  taskId: "task-1",
  councilSessionId: "council-1",
  reportId: "report-1",
  usageRecordId: "usage-1",
  traceId: "trace-1",
  tokensUsed: 1200,
  estimatedCostUSD: 0.012,
  provider: "openrouter",
  model: "deepseek/v4",
  promptPreview: "Prompt evidence",
  responsePreview: "Response evidence",
  links: {
    trace: "/usage-traces/trace-1",
    task: "/council",
    council: "/council",
    report: "/reports",
    project: "/projects/project-1",
    usageRecord: null,
  },
};

const profile: LivingAgentProfileDto = {
  agent: {
    id: "agent-1",
    slug: "grand-vizier",
    name: "Aurelian",
    title: "Grand Vizier",
    role: "GRAND_VIZIER",
    specialty: "Orchestration",
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
    currentStatus: "RESPONDING",
    lastActivityAt: nowIso,
    lastActivityTitle: "Council synthesis",
    totalCalls: 42,
    totalTokens: 12000,
    totalEstimatedCostUSD: 0.12,
    tokensToday: 1200,
    costToday: 0.012,
    trustedTraceCount: 4,
    partialTraceCount: 1,
    legacyUnattributedCount: 2,
    linkedProjectCount: 1,
    providerSummary: [
      { provider: "openrouter", callCount: 42, totalCostUSD: 0.12 },
    ],
    modelSummary: [{ model: "deepseek/v4", callCount: 42 }],
    topOperations: [{ operation: "council", count: 12 }],
  },
  currentActivity: {
    status: "RESPONDING",
    activityType: "COUNCIL",
    title: "Council synthesis",
    detail: "Current activity detail",
    providerName: "openrouter",
    model: "deepseek/v4",
    startedAt: nowIso,
    isStale: false,
  },
  usageSummary: {
    totalCalls: 42,
    totalTokens: 12000,
    totalEstimatedCostUSD: 0.12,
    tokensToday: 1200,
    costToday: 0.012,
    callsToday: 2,
    byProvider: [
      {
        provider: "openrouter",
        model: "deepseek/v4",
        callCount: 42,
        totalTokens: 12000,
        totalCostUSD: 0.12,
      },
    ],
  },
  traceSummary: {
    trustedCount: 4,
    partialCount: 1,
    legacyUnattributedCount: 2,
    totalCount: 7,
  },
  relatedProjects: [{ id: "project-1", name: "AI Kingdom" }],
  relatedCouncilSessions: [
    {
      id: "council-1",
      taskId: "task-1",
      status: "COMPLETED",
      createdAt: nowIso,
    },
  ],
  relatedReports: [
    {
      id: "report-1",
      title: "Council report",
      category: "COUNCIL",
      createdAt: nowIso,
    },
  ],
  relatedMemories: [
    {
      id: "memory-1",
      title: "Council memory",
      type: "DECISION",
      createdAt: nowIso,
    },
  ],
  providerModelSummary: [
    {
      provider: "openrouter",
      model: "deepseek/v4",
      callCount: 42,
      totalCostUSD: 0.12,
    },
  ],
  auditSummary: [
    { action: "agent.profile.updated", createdAt: nowIso, metadata: {} },
  ],
  recentTimeline: [timelineItem],
};

const relations: LivingAgentRelationsDto = {
  nodes: {
    agent: {
      id: "agent-1",
      slug: "grand-vizier",
      name: "Aurelian",
      title: "Grand Vizier",
      role: "GRAND_VIZIER",
    },
    projects: [{ id: "project-1", name: "AI Kingdom", status: "ACTIVE" }],
    tasks: [
      {
        id: "task-1",
        title: "Plan the release",
        mode: "PLAN",
        status: "COMPLETED",
      },
    ],
    councilSessions: [
      {
        id: "council-1",
        taskId: "task-1",
        status: "COMPLETED",
        createdAt: nowIso,
      },
    ],
    usageTraces: [
      {
        id: "trace-node-1",
        traceId: "trace-1",
        operation: "council",
        status: "COMPLETED",
        startedAt: nowIso,
      },
    ],
    reports: [
      {
        id: "report-1",
        title: "Council report",
        category: "COUNCIL",
        createdAt: nowIso,
      },
    ],
    memories: [
      {
        id: "memory-1",
        title: "Council memory",
        type: "DECISION",
        createdAt: nowIso,
      },
    ],
    providers: [
      { provider: "openrouter", model: "deepseek/v4", callCount: 42 },
    ],
  },
  edges: [
    {
      source: "agent-1",
      target: "project-1",
      type: "ACTIVITY_PROJECT",
      label: "worked on",
    },
  ],
};

const candidate = {
  id: "candidate-1",
  agentId: "agent-1",
  projectId: "project-1",
  taskId: "task-1",
  councilSessionId: "council-1",
  traceId: "trace-1",
  sourceType: "TRACE",
  sourceId: "trace-1",
  title: "Retry policy lesson",
  content: "Candidate content",
  summary: null,
  category: "WORKFLOW_RULE",
  confidence: 90,
  status: "PENDING",
  proposedByAgentId: "agent-1",
  reviewedByUserId: null,
  reviewedAt: null,
  rejectionReason: null,
  tags: [],
  fingerprint: null,
  metadata: {},
  createdAt: nowIso,
  updatedAt: nowIso,
} as KnowledgeCandidateDto;

const memory = {
  id: "knowledge-1",
  sourceCandidateId: "candidate-1",
  agentId: "agent-1",
  projectId: "project-1",
  title: "Approved retry lesson",
  content: "Approved memory content",
  summary: null,
  category: "WORKFLOW_RULE",
  trustLevel: "HIGH",
  tags: [],
  fingerprint: null,
  createdFromTraceId: "trace-1",
  approvedByUserId: "user-1",
  approvedAt: nowIso,
  lastUsedAt: null,
  useCount: 2,
  metadata: {},
  createdAt: nowIso,
  updatedAt: nowIso,
} as KnowledgeMemoryDto;

const apiMocks = vi.hoisted(() => ({
  getLivingAgentProfile: vi.fn(),
  getLivingAgentTimeline: vi.fn(),
  getLivingAgentRelations: vi.fn(),
  agentKnowledgeCandidates: vi.fn(),
  agentKnowledgeMemories: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMocks }));

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function setup(options: { loadError?: Error } = {}) {
  if (options.loadError)
    apiMocks.getLivingAgentProfile.mockRejectedValue(options.loadError);
  else apiMocks.getLivingAgentProfile.mockResolvedValue({ profile });
  apiMocks.getLivingAgentTimeline.mockResolvedValue({
    items: [timelineItem],
    nextCursor: null,
    total: 1,
  });
  apiMocks.getLivingAgentRelations.mockResolvedValue({ relations });
  apiMocks.agentKnowledgeCandidates.mockResolvedValue({
    candidates: [candidate],
  });
  apiMocks.agentKnowledgeMemories.mockResolvedValue({ memories: [memory] });
}

function renderPage(language: "en" | "th" = "en") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/living-agents/agent-1"]}>
        <Routes>
          <Route
            path="/living-agents/:agentId"
            element={<LivingAgentProfilePage />}
          />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("LivingAgentProfilePage evidence workspace", () => {
  it("renders five evidence sections and canonical owner links", async () => {
    setup();
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Grand Vizier" }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", {
      name: "Agent evidence sections",
    });
    expect(within(nav).getAllByRole("button")).toHaveLength(5);
    expect(
      screen.getByRole("link", { name: "Back to living agents" }),
    ).toHaveAttribute("href", "/living-agents");
    expect(
      screen.getByRole("link", { name: "Open agent registry" }),
    ).toHaveAttribute("href", "/agents");
    expect(
      screen.getByRole("link", { name: "Open provider registry" }),
    ).toHaveAttribute("href", "/providers");
  });

  it("loads and filters the timeline only when its section opens", async () => {
    setup();
    renderPage();
    await screen.findByRole("heading", { name: "Grand Vizier" });
    expect(apiMocks.getLivingAgentTimeline).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Timeline" }));
    await waitFor(() =>
      expect(apiMocks.getLivingAgentTimeline).toHaveBeenCalledWith("agent-1", {
        limit: 50,
      }),
    );
    expect(
      await screen.findByRole("link", { name: "Open usage trace" }),
    ).toHaveAttribute("href", "/usage-traces/trace-1");
    await userEvent.selectOptions(
      screen.getByLabelText("Attribution evidence"),
      "TRUSTED",
    );
    await waitFor(() =>
      expect(apiMocks.getLivingAgentTimeline).toHaveBeenLastCalledWith(
        "agent-1",
        { limit: 50, attributionStatus: "TRUSTED" },
      ),
    );
  });

  it("loads work relationships lazily and preserves source routes", async () => {
    setup();
    renderPage();
    await screen.findByRole("heading", { name: "Grand Vizier" });
    expect(apiMocks.getLivingAgentRelations).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Work & relationships" }),
    );
    await waitFor(() =>
      expect(apiMocks.getLivingAgentRelations).toHaveBeenCalledWith("agent-1"),
    );
    expect(
      await screen.findByRole("link", { name: "Open project AI Kingdom" }),
    ).toHaveAttribute("href", "/projects/project-1");
    expect(
      screen.getByRole("link", { name: "Open council session" }),
    ).toHaveAttribute("href", "/council");
    expect(
      screen.getByRole("link", { name: "Open report Council report" }),
    ).toHaveAttribute("href", "/reports");
  });

  it("distinguishes a relationship load failure from an empty result and retries", async () => {
    setup();
    apiMocks.getLivingAgentRelations.mockRejectedValueOnce(
      new Error("Relations unavailable"),
    );
    renderPage();
    await screen.findByRole("heading", { name: "Grand Vizier" });
    await userEvent.click(
      screen.getByRole("button", { name: "Work & relationships" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Work relationships could not be loaded.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("link", { name: "Open project AI Kingdom" }),
    ).toHaveAttribute("href", "/projects/project-1");
  });

  it("keeps usage, traces, and legacy attribution explicit", async () => {
    setup();
    renderPage();
    await screen.findByRole("heading", { name: "Grand Vizier" });
    await userEvent.click(
      screen.getByRole("button", { name: "Usage & traces" }),
    );
    expect(screen.getByText("Legacy attribution")).toBeInTheDocument();
    expect(
      screen.getByText("2 records cannot be fully linked to their source."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("deepseek/v4").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Open trace Council synthesis" }),
    ).toHaveAttribute("href", "/usage-traces/trace-1");
  });

  it("loads knowledge lazily and keeps review, memory, and audit ownership visible", async () => {
    setup();
    renderPage();
    await screen.findByRole("heading", { name: "Grand Vizier" });
    expect(apiMocks.agentKnowledgeCandidates).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Knowledge & audit" }),
    );
    await waitFor(() =>
      expect(apiMocks.agentKnowledgeCandidates).toHaveBeenCalledWith("agent-1"),
    );
    expect(await screen.findByText("Retry policy lesson")).toBeInTheDocument();
    expect(screen.getByText("Approved retry lesson")).toBeInTheDocument();
    expect(screen.getByText("agent.profile.updated")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open knowledge candidates" }),
    ).toHaveAttribute("href", "/knowledge-lab/candidates?agentId=agent-1");
    expect(
      screen.getByRole("link", { name: "Open approved knowledge" }),
    ).toHaveAttribute("href", "/knowledge-lab/memories?agentId=agent-1");
  });

  it("keeps partial knowledge evidence visible and offers a retry", async () => {
    setup();
    apiMocks.agentKnowledgeCandidates.mockRejectedValueOnce(
      new Error("Candidates unavailable"),
    );
    renderPage();
    await screen.findByRole("heading", { name: "Grand Vizier" });
    await userEvent.click(
      screen.getByRole("button", { name: "Knowledge & audit" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some knowledge evidence could not be loaded.",
    );
    expect(screen.getByText("Approved retry lesson")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Retry policy lesson")).toBeInTheDocument();
  });

  it("shows bounded errors and semantic Thai chrome while preserving identity data", async () => {
    setup({ loadError: new Error("Profile unavailable") });
    const { unmount } = renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Profile unavailable",
    );
    unmount();
    vi.clearAllMocks();
    setup();
    renderPage("th");
    expect(
      await screen.findByRole("heading", { name: "Grand Vizier" }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", {
      name: "ส่วนหลักฐานของเอเจนต์",
    });
    expect(
      within(nav).getByRole("button", { name: "ภาพรวม" }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("button", { name: "งานและความสัมพันธ์" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "กลับไปรายชื่อเอเจนต์มีชีวิต" }),
    ).toHaveAttribute("href", "/living-agents");
  });
});
