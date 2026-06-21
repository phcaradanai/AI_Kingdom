import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDto, ProjectInboxItemDto, PublicUser } from "@/types/api";
import { ProjectInboxPage } from "./ProjectInboxPage";

const nowIso = new Date().toISOString();
const project: ProjectDto = {
  id: "proj-1", name: "Castle Keep", codename: "KEEP", description: "Core kingdom project", status: "ACTIVE", priority: "HIGH",
  goals: [], keywords: ["castle"], aliases: ["keep"], repositoryUrl: null, localPath: null, activeMilestone: null, ownerUserId: null, createdAt: nowIso, updatedAt: nowIso
};
const inboxItem: ProjectInboxItemDto = {
  id: "route-1", sourceType: "WORK_ORDER", sourceId: "wo-1", title: "Route castle work", humanTitle: "Route castle work",
  summary: "The work order references the castle repository.", candidateProjectIds: ["proj-1"], status: "PENDING", assignedProjectId: null,
  confidenceScore: 62, reason: "Keyword castle matched Castle Keep.", humanReason: "Keyword castle matched Castle Keep.", dataSource: "work_order",
  dataQuality: "REVIEW_REQUIRED", dataQualityLabel: "REVIEW_REQUIRED", provenance: { rootPath: "/Users/private/secret-project" }, traceId: "trace-1",
  createdBySystem: true, humanReadableSource: "Work Order: Fortify Castle", sourceLink: { label: "Work Order", title: "Fortify Castle", href: "/work-orders/wo-1", type: "WORK_ORDER", id: "wo-1" },
  routingConfidence: 62, routingQuality: "MEDIUM", evidence: [{ type: "keyword", value: "castle", projectName: "Castle Keep" }],
  ignoredSignals: [{ type: "keyword", value: "generic" }], createdAt: nowIso, updatedAt: nowIso
};

const apiMocks = vi.hoisted(() => ({
  projects: vi.fn(), projectInbox: vi.fn(), assignProjectInboxItem: vi.fn(), dismissProjectInboxItem: vi.fn(), archiveProjectInboxItem: vi.fn(),
  bulkDismissProjectInboxItems: vi.fn(), bulkAssignProjectInboxItems: vi.fn(), bulkArchiveProjectInboxItems: vi.fn(), archiveLowConfidenceProjectInboxItems: vi.fn()
}));
vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({ useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser }) }));

function renderPage() { return render(<MemoryRouter><ProjectInboxPage /></MemoryRouter>); }

beforeEach(() => {
  localStorage.clear();
  currentUser = { id: "king-1", email: "king@example.com", displayName: "The King", role: "KING" };
  apiMocks.projects.mockResolvedValue({ projects: [project] });
  apiMocks.projectInbox.mockResolvedValue({ inboxItems: [inboxItem] });
  apiMocks.assignProjectInboxItem.mockResolvedValue({ inboxItem: { ...inboxItem, status: "ASSIGNED" } });
  apiMocks.dismissProjectInboxItem.mockResolvedValue({ inboxItem: { ...inboxItem, status: "DISMISSED" } });
  apiMocks.archiveProjectInboxItem.mockResolvedValue({ inboxItem: { ...inboxItem, status: "ARCHIVED" } });
});

afterEach(() => { vi.clearAllMocks(); currentUser = null; localStorage.clear(); });

describe("ProjectInboxPage", () => {
  it("leads with routing hierarchy, deterministic evidence, and owning source links", async () => {
    renderPage();
    expect(await screen.findByRole("region", { name: "Project routing queue" })).toBeInTheDocument();
    expect(screen.getAllByText("Keyword castle matched Castle Keep.").length).toBeGreaterThan(0);
    expect(screen.getByText("Keyword: castle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Work Order/ })).toHaveAttribute("href", "/work-orders/wo-1");
    expect(screen.getByRole("link", { name: /Suggested project/ })).toHaveAttribute("href", "/projects/proj-1");
    expect(screen.getByRole("link", { name: /Routing trace/ })).toHaveAttribute("href", "/usage-traces/trace-1");
    expect(screen.queryByText("/Users/private/secret-project")).not.toBeInTheDocument();
  });

  it("keeps assignment explicit and uses the existing routing API", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Assign" }));
    await waitFor(() => expect(apiMocks.assignProjectInboxItem).toHaveBeenCalledWith("route-1", "proj-1"));
  });

  it("reveals safe bulk actions only after selecting a pending decision", async () => {
    renderPage();
    expect(screen.queryByRole("combobox", { name: "Project for selected decisions" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("checkbox", { name: /Select Route castle work/ }));
    const bulkProject = screen.getByRole("combobox", { name: "Project for selected decisions" });
    await userEvent.selectOptions(bulkProject, "proj-1");
    apiMocks.bulkAssignProjectInboxItems.mockResolvedValue({ inboxItems: [] });
    await userEvent.click(screen.getByRole("button", { name: "Assign 1" }));
    await waitFor(() => expect(apiMocks.bulkAssignProjectInboxItems).toHaveBeenCalledWith(["route-1"], "proj-1"));
  });

  it("renders a stable empty state", async () => {
    apiMocks.projectInbox.mockResolvedValue({ inboxItems: [] });
    renderPage();
    expect(await screen.findByText("No routing decisions match this view")).toBeInTheDocument();
  });
});
