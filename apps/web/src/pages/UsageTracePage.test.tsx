import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type { UsageTraceDetailsDto, AIUsageTraceStepDto } from "@/types/api";
import { UsageTracePage } from "./UsageTracePage";

const nowIso = new Date().toISOString();

const apiMocks = vi.hoisted(() => ({
  usageTrace: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

// ─── Fixture helpers ────────────────────────────────────────────────────────

function makeStep(overrides: Partial<AIUsageTraceStepDto> & { id: string; sequence: number; stepType: string }): AIUsageTraceStepDto {
  const defaults: AIUsageTraceStepDto = {
    id: overrides.id,
    traceId: "trace-1",
    parentStepId: null,
    stepType: overrides.stepType,
    operation: "GENERATE",
    title: `Step ${overrides.sequence}`,
    detail: null,
    status: "COMPLETED",
    sequence: overrides.sequence,
    agentId: null,
    providerId: null,
    providerType: null,
    providerName: null,
    model: null,
    usageRecordId: null,
    taskId: null,
    projectId: null,
    councilSessionId: null,
    reportId: null,
    tokensUsed: null,
    estimatedCostUSD: null,
    durationMs: null,
    promptPreview: null,
    responsePreview: null,
    errorMessage: null,
    metadata: null,
    startedAt: nowIso,
    endedAt: nowIso,
    agent: null
  };
  return { ...defaults, ...overrides };
}

function makeDetails(overrides: Partial<UsageTraceDetailsDto> = {}): UsageTraceDetailsDto {
  return {
    trace: {
      id: "trace-db-1",
      traceId: "trace-abc123",
      actorUserId: "user-king",
      actorRole: "KING",
      actorDisplayName: "The King",
      triggerType: "USER_ACTION",
      triggerRoute: "/api/tasks",
      triggerLabel: null,
      projectId: null,
      taskId: "task-1",
      councilSessionId: "session-1",
      agentId: null,
      sourceType: "TASK",
      sourceId: "task-1",
      operation: "COUNCIL_SYNTHESIS",
      purpose: "Plan the kingdom expansion",
      providerId: "openai-1",
      providerType: "openai",
      providerName: "openai",
      model: "gpt-4.1",
      status: "COMPLETED",
      startedAt: nowIso,
      completedAt: nowIso,
      failedAt: null,
      promptPreview: "What should the kingdom do next?",
      responsePreview: "The kingdom should expand to the east.",
      errorMessage: null,
      metadata: { attributionStatus: "TRUSTED" },
      createdAt: nowIso,
      updatedAt: nowIso
    },
    usageRecords: [
      {
        id: "usage-1",
        provider: "openai",
        providerId: "openai-1",
        model: "gpt-4.1",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        estimatedCostUSD: 0.0012,
        attributionStatus: "TRUSTED",
        createdAt: nowIso,
        pricingStatus: "KNOWN"
      }
    ],
    agentActivities: [],
    steps: [
      makeStep({ id: "step-1", sequence: 1, stepType: "PROVIDER_CALL", title: "Call openai", providerName: "openai", model: "gpt-4.1" }),
      makeStep({ id: "step-2", sequence: 2, stepType: "PROVIDER_CALL_SUCCESS", title: "openai success", providerName: "openai", model: "gpt-4.1", providerType: "openai", durationMs: 1200, tokensUsed: 150, estimatedCostUSD: 0.0012 }),
      makeStep({ id: "step-3", sequence: 3, stepType: "USAGE_RECORDED", title: "Usage recorded" }),
      makeStep({ id: "step-4", sequence: 4, stepType: "TRACE_COMPLETED", title: "Trace complete" })
    ],
    hasTimelineSteps: true,
    totals: { totalTokens: 150, totalEstimatedCostUSD: 0.0012, providerCallCount: 1, fallbackCount: 0, agentCount: 1, usageRecordCount: 1 },
    links: {
      project: null,
      task: { id: "task-1", title: "Plan the expansion", mode: "PLAN", status: "COMPLETED" },
      councilSession: { id: "session-1", status: "COMPLETED", taskId: "task-1", projectId: null },
      agent: null,
      reports: []
    },
    ...overrides
  };
}

function renderTrace(traceId = "trace-abc123") {
  return render(
    <MemoryRouter initialEntries={[`/usage-traces/${traceId}`]}>
      <Routes>
        <Route path="/usage-traces/:traceId" element={<UsageTracePage />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("UsageTracePage", () => {
  describe("normal trace", () => {
    it("renders attribution summary, totals, timeline, source links, and previews", async () => {
      apiMocks.usageTrace.mockResolvedValue(makeDetails());
      renderTrace();

      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());

      // Attribution summary card
      expect(screen.getByText("trace-abc123")).toBeInTheDocument();
      expect(screen.getByText("Plan the kingdom expansion")).toBeInTheDocument();
      expect(screen.getByText("Verified source")).toBeInTheDocument();
      expect(screen.getByText("The King")).toBeInTheDocument();

      // Totals strip (label appears in both strip and Final Resolution)
      expect(screen.getAllByText("Total Tokens").length).toBeGreaterThanOrEqual(1);
      // 150 token count appears in totals and usage record
      expect(screen.getAllByText("150").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Estimated Cost")).toBeInTheDocument();
      expect(screen.getAllByText(/\$0\.0012/).length).toBeGreaterThanOrEqual(1);

      // Timeline
      expect(screen.getByText("Operation Timeline")).toBeInTheDocument();
      expect(screen.getByText("Call openai")).toBeInTheDocument();
      expect(screen.getByText("openai success")).toBeInTheDocument();

      // Previews
      expect(screen.getByText("Safe Prompt Preview")).toBeInTheDocument();
      expect(screen.getByText("What should the kingdom do next?")).toBeInTheDocument();
      expect(screen.getByText("Safe Response Preview")).toBeInTheDocument();
      expect(screen.getByText("The kingdom should expand to the east.")).toBeInTheDocument();

      // Source ownership links ("Treasury" also appears in back button)
      expect(screen.getByText("Provider Config")).toBeInTheDocument();
      expect(screen.getByText("Route Chain")).toBeInTheDocument();
      expect(screen.getAllByText("Treasury").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Audit Log")).toBeInTheDocument();
    });

    it("shows related record links for task and council", async () => {
      apiMocks.usageTrace.mockResolvedValue(makeDetails());
      renderTrace();

      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());

      expect(screen.getByText("Plan the expansion")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Plan the expansion/i })).toHaveAttribute("href", "/throne-room?view=command");
      const councilIdText = "session-1".slice(0, 8);
      expect(screen.getByText(councilIdText)).toBeInTheDocument();
      // Council link text is the truncated session id
      const councilLink = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/council");
      expect(councilLink).toBeDefined();
    });
  });

  describe("fallback / multiple attempts trace", () => {
    it("shows fallback count and sandbox-after-api warning", async () => {
      const details = makeDetails({
        steps: [
          makeStep({ id: "s1", sequence: 1, stepType: "PROVIDER_CALL", title: "Call openrouter", providerName: "openrouter" }),
          makeStep({ id: "s2", sequence: 2, stepType: "PROVIDER_CALL_FAILED", title: "openrouter failed", providerName: "openrouter", providerType: "openrouter", durationMs: 500, errorMessage: "Timeout" }),
          makeStep({ id: "s3", sequence: 3, stepType: "PROVIDER_FALLBACK", title: "Fallback to sandbox" }),
          makeStep({ id: "s4", sequence: 4, stepType: "PROVIDER_CALL_SUCCESS", title: "sandbox success", providerName: "sandbox", providerType: "sandbox", durationMs: 100 }),
          makeStep({ id: "s5", sequence: 5, stepType: "TRACE_COMPLETED", title: "Done" })
        ],
        totals: { totalTokens: 0, totalEstimatedCostUSD: 0, providerCallCount: 1, fallbackCount: 1, agentCount: 0, usageRecordCount: 0 }
      });
      apiMocks.usageTrace.mockResolvedValue(details);
      renderTrace();

      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());

      // Fallback count in totals
      expect(screen.getByText("Fallbacks")).toBeInTheDocument();
      expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);

      // Fallback notice in Final Resolution (1 failed + 1 success = 2 attempts)
      expect(screen.getByText(/1 fallback.*used across.*2 attempt/i)).toBeInTheDocument();

      // Sandbox-after-api warning
      expect(screen.getByText(/Used Local Sandbox only after all configured API models failed/i)).toBeInTheDocument();

      // Error message in step card
      expect(screen.getByText("Timeout")).toBeInTheDocument();
    });

    it("shows sandbox-no-api warning when only sandbox was used", async () => {
      const details = makeDetails({
        steps: [
          makeStep({ id: "s1", sequence: 1, stepType: "PROVIDER_CALL_SUCCESS", title: "sandbox", providerType: "sandbox", durationMs: 100 })
        ],
        totals: { totalTokens: 0, totalEstimatedCostUSD: 0, providerCallCount: 1, fallbackCount: 0, agentCount: 0, usageRecordCount: 0 }
      });
      apiMocks.usageTrace.mockResolvedValue(details);
      renderTrace();

      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());
      expect(screen.getByText(/Local Sandbox was used without attempting configured API models/i)).toBeInTheDocument();
    });
  });

  describe("failed trace", () => {
    it("shows error message in attribution summary", async () => {
      const details = makeDetails({
        trace: {
          ...makeDetails().trace,
          status: "FAILED",
          errorMessage: "Provider timeout after 20000ms",
          completedAt: null,
          failedAt: nowIso,
          metadata: { attributionStatus: "PARTIAL" }
        }
      });
      apiMocks.usageTrace.mockResolvedValue(details);
      renderTrace();

      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());

      expect(screen.getByText("Provider timeout after 20000ms")).toBeInTheDocument();
      expect(screen.getByText("Partial source")).toBeInTheDocument();
      expect(screen.getByText("This trace has partial attribution — some source records may be incomplete.")).toBeInTheDocument();
    });
  });

  describe("legacy / partial evidence trace", () => {
    it("shows legacy warning with recovery message when no timeline steps", async () => {
      const details = makeDetails({
        steps: [],
        hasTimelineSteps: false
      });
      apiMocks.usageTrace.mockResolvedValue(details);
      renderTrace();

      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());

      expect(screen.getByText("This trace was created before timeline steps were available. Full audit trail is not verifiable.")).toBeInTheDocument();
      expect(screen.getByText("Open the linked Council session or Task for the available evidence.")).toBeInTheDocument();

      // Timeline section should not appear
      expect(screen.queryByText("Operation Timeline")).not.toBeInTheDocument();
    });
  });

  describe("sanitized preview boundary", () => {
    it("shows recovery message when prompt and response previews are null", async () => {
      const details = makeDetails({
        trace: {
          ...makeDetails().trace,
          promptPreview: null,
          responsePreview: null
        }
      });
      apiMocks.usageTrace.mockResolvedValue(details);
      renderTrace();

      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());

      const emptyMessages = screen.getAllByText("No sanitized preview available.");
      expect(emptyMessages).toHaveLength(2);
      const sanitizedNotes = screen.getAllByText("Secrets and sensitive content are redacted by the server before storage.");
      expect(sanitizedNotes).toHaveLength(2);
    });

    it("shows preview content when available and hides recovery message", async () => {
      apiMocks.usageTrace.mockResolvedValue(makeDetails());
      renderTrace();

      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());

      expect(screen.queryByText("No sanitized preview available.")).not.toBeInTheDocument();
      expect(screen.getByText("What should the kingdom do next?")).toBeInTheDocument();
      expect(screen.getByText("The kingdom should expand to the east.")).toBeInTheDocument();
    });

    it("expands step-level preview on toggle", async () => {
      const details = makeDetails({
        steps: [
          makeStep({ id: "s1", sequence: 1, stepType: "PROVIDER_CALL_SUCCESS", title: "provider call", promptPreview: "Step prompt text", responsePreview: "Step response text" })
        ]
      });
      apiMocks.usageTrace.mockResolvedValue(details);
      renderTrace();

      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());

      // Preview content hidden by default
      expect(screen.queryByText("Step prompt text")).not.toBeInTheDocument();

      // Click safe preview toggle
      await userEvent.click(screen.getByRole("button", { name: /Safe Preview/i }));
      expect(screen.getByText("Step prompt text")).toBeInTheDocument();
      expect(screen.getByText("Step response text")).toBeInTheDocument();
    });
  });

  describe("source ownership links", () => {
    it("renders all four source ownership links with correct hrefs", async () => {
      apiMocks.usageTrace.mockResolvedValue(makeDetails());
      renderTrace();

      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());

      const providerLink = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/providers");
      const routingLink = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/routing");
      const treasuryLink = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/treasury");
      const auditLink = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/audit");

      expect(providerLink).toBeDefined();
      expect(routingLink).toBeDefined();
      expect(treasuryLink).toBeDefined();
      expect(auditLink).toBeDefined();
    });
  });

  describe("EN/TH labels", () => {
    it("renders English labels by default", async () => {
      apiMocks.usageTrace.mockResolvedValue(makeDetails());
      renderTrace();

      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());

      expect(screen.getByText("AI Usage Audit")).toBeInTheDocument();
      expect(screen.getByText("Verified source")).toBeInTheDocument();
      expect(screen.getByText("Operation Timeline")).toBeInTheDocument();
      expect(screen.getByText("Final Resolution")).toBeInTheDocument();
      expect(screen.getByText("Source Ownership")).toBeInTheDocument();
    });

    it("renders Thai labels when language is set to th", async () => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, "th");
      apiMocks.usageTrace.mockResolvedValue(makeDetails());
      renderTrace();

      await waitFor(() => expect(screen.queryByText("กำลังโหลด trace…")).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Loading trace…")).not.toBeInTheDocument());

      expect(screen.getByText("การตรวจสอบการใช้ AI")).toBeInTheDocument();
      expect(screen.getByText("ยืนยันแหล่งที่มาแล้ว")).toBeInTheDocument();
      expect(screen.getByText("ไทม์ไลน์การดำเนินการ")).toBeInTheDocument();
      expect(screen.getByText("ผลลัพธ์สุดท้าย")).toBeInTheDocument();
      expect(screen.getByText("เจ้าของแหล่งข้อมูล")).toBeInTheDocument();
    });
  });
});
