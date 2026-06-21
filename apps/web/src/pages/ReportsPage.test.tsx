import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type { ReportDto, ReportPayload } from "@/types/api";
import { ReportsPage } from "./ReportsPage";

const nowIso = "2026-06-21T08:00:00.000Z";

const reports = [
  makeReport("report-1", "Kingdom launch review", "A final review of launch readiness."),
  makeReport("report-2", "Provider routing audit", "Evidence from the provider routing audit.")
];

const storeState = vi.hoisted(() => ({
  reports: [] as ReportDto[],
  isLoading: false,
  error: null as string | null,
  searchReports: vi.fn(),
  updateReport: vi.fn(),
  deleteReport: vi.fn()
}));

vi.mock("@/stores/kingdomStore", () => ({
  useKingdomStore: (selector: (state: typeof storeState) => unknown) => selector(storeState)
}));

function makeReport(id: string, title: string, summary: string): ReportDto {
  return {
    id,
    title,
    summary,
    content: `# ${title}\n\nFull archived counsel.`,
    projectId: "project-1",
    sourceTaskId: `task-${id}`,
    sourceCouncilSessionId: `session-${id}`,
    category: "STRATEGY",
    importance: id === "report-1" ? "CRITICAL" : "MEDIUM",
    tags: ["launch", "evidence"],
    createdBy: "Royal Secretary",
    createdAt: nowIso,
    updatedAt: nowIso,
    task: {
      id: `task-${id}`,
      command: `Review source decree for ${title}.`,
      status: "COMPLETED",
      mode: "BUILD",
      createdAt: nowIso
    },
    councilSession: {
      id: `session-${id}`,
      responses: [{ id: `response-${id}`, role: "Royal Architect" }]
    } as ReportDto["councilSession"]
  };
}

function renderPage(language: "en" | "th" = "en") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  storeState.reports = [...reports];
  storeState.searchReports.mockResolvedValue(undefined);
  storeState.updateReport.mockImplementation(async (id: string, payload: Partial<ReportPayload>) => ({
    ...reports.find((report) => report.id === id)!,
    ...payload
  }));
  storeState.deleteReport.mockResolvedValue(undefined);

  return render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  storeState.reports = [];
  storeState.error = null;
  storeState.isLoading = false;
});

describe("ReportsPage", () => {
  it("renders a compact archive and changes the selected reading pane", async () => {
    renderPage();

    expect(screen.getByTestId("reports-master-detail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kingdom launch review/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Open Council" })).toHaveAttribute("href", "/council");

    await userEvent.click(screen.getByRole("button", { name: /Provider routing audit/i }));

    expect(screen.getByRole("button", { name: /Provider routing audit/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("report-detail")).toHaveTextContent("Provider routing audit");
  });

  it("requires explicit confirmation before deleting a report", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Delete Report" }));
    expect(storeState.deleteReport).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Delete archived report?" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

    await waitFor(() => expect(storeState.deleteReport).toHaveBeenCalledWith("report-1"));
  });

  it("renders semantic archive chrome in Thai", () => {
    renderPage("th");

    expect(screen.getByRole("heading", { name: "รายงานราชสำนัก" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "คลังรายงาน" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "แก้ไขรายงาน" })).toBeInTheDocument();
  });
});
