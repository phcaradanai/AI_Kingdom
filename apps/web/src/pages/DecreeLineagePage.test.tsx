import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type { DecreeLineageDto } from "@/types/api";
import { DecreeLineagePage } from "./DecreeLineagePage";

const apiMocks = vi.hoisted(() => ({ getDecreeLineage: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMocks }));

const lineage: DecreeLineageDto = {
  anchor: { workOrderId: "work-order-1", taskId: "task-1", sessionId: "session-1" },
  decree: {
    id: "task-1",
    title: "Launch the kingdom",
    command: "Prepare and validate the launch.",
    mode: "BUILD",
    createdAt: "2026-06-21T08:00:00.000Z",
    createdByName: "The King"
  },
  council: {
    id: "session-1",
    finalSummary: "Proceed with guarded execution.",
    fallbackNotice: null,
    createdAt: "2026-06-21T08:10:00.000Z",
    responses: [{ role: "Royal Architect", agent: { id: "agent-1", name: "Cassian", title: "Architect" }, response: "Use the existing architecture." }]
  },
  owner: {
    workOrderId: "work-order-1",
    title: "Implement launch readiness",
    status: "NEEDS_REVIEW",
    contextBindingStatus: "FRESH",
    executionTarget: "EXTERNAL_AGENT",
    assignedAgent: null,
    assignedAgentReason: null,
    assignedExternalAgentName: "Claude Code"
  },
  externalPrompt: { runId: "run-1", externalAgentName: "Claude Code", inputPrompt: "Implement the approved plan." },
  externalResult: {
    runId: "run-1",
    status: "SUCCEEDED",
    exitCode: 0,
    outputText: "Implementation completed.",
    completedAt: "2026-06-21T09:00:00.000Z",
    patches: [{ id: "patch-1", validationStatus: "PENDING", riskLevel: "LOW", filesChanged: ["apps/web/src/App.tsx"], diffStat: "1 file changed" }]
  },
  review: {
    reviewerAgent: { id: "agent-2", name: "Aurelian", title: "Reviewer" },
    verdict: "PASS",
    confidence: "HIGH",
    kingRecommendation: "APPROVE",
    summary: "The result satisfies the acceptance criteria.",
    createdAt: "2026-06-21T09:10:00.000Z",
    knowledge: []
  },
  secretarySummary: {
    id: "summary-1",
    title: "Royal Secretary Summary",
    summary: "The implementation is ready for the King's review.",
    createdAt: "2026-06-21T09:15:00.000Z",
    synthesized: true
  }
};

function renderPage(language: "en" | "th" = "en") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  apiMocks.getDecreeLineage.mockResolvedValue({ lineage });
  return render(
    <MemoryRouter initialEntries={["/decree-lineage/work-order-1?taskId=task-1"]}>
      <Routes>
        <Route path="/decree-lineage/:workOrderId" element={<DecreeLineagePage />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe("DecreeLineagePage", () => {
  it("renders all seven stages in order with owning source links", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "What happened to this command" });
    const stages = screen.getAllByTestId("lineage-stage");
    expect(stages).toHaveLength(7);
    expect(stages.map((stage) => within(stage).getByTestId("lineage-stage-number").textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(screen.getByRole("link", { name: "Open Work Order" })).toHaveAttribute("href", "/work-orders?focus=work-order-1");
    expect(screen.getByRole("link", { name: "Open Council" })).toHaveAttribute("href", "/council");
    expect(screen.getByRole("link", { name: "Open Automation Jobs" })).toHaveAttribute("href", "/automation-jobs");
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("keeps semantic stage chrome readable in Thai", async () => {
    renderPage("th");

    await waitFor(() => expect(screen.getByRole("heading", { name: "เกิดอะไรขึ้นกับคำสั่งนี้" })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "เส้นทางหลักฐาน" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "คำสั่งของกษัตริย์" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "เปิดใบสั่งงาน" })).toHaveAttribute("href", "/work-orders?focus=work-order-1");
  });
});
