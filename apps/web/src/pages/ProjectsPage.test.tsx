import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectContextHealthDto, ProjectDto, PublicUser, WorkOrderDto } from "@/types/api";
import { ProjectsPage } from "./ProjectsPage";

const nowIso = new Date().toISOString();

const project: ProjectDto = {
  id: "proj-1",
  name: "Castle Keep",
  codename: "KEEP",
  description: "Fortify the project context.",
  status: "ACTIVE",
  priority: "HIGH",
  goals: ["Keep context fresh"],
  keywords: ["castle"],
  aliases: ["keep"],
  repositoryUrl: "https://github.com/kingdom/castle-keep",
  localPath: null,
  activeMilestone: "M17E Project Context",
  ownerUserId: null,
  createdAt: nowIso,
  updatedAt: nowIso
};

const staleHealth: ProjectContextHealthDto = {
  status: "STALE",
  lines: ["Local docs changed after latest snapshot."],
  binding: {
    status: "STALE",
    projectId: "proj-1",
    localDocumentSnapshotId: "snap-old",
    repositorySnapshotId: null,
    localSnapshotScannedAt: nowIso,
    repositoryCommitSha: null,
    repositoryBranch: null,
    detectedStack: ["React"],
    packageScripts: {},
    riskZones: [],
    importantDocs: [],
    rootIds: [],
    rootNames: [],
    rootPathHashes: [],
    localDocsChanged: true,
    warnings: []
  },
  openWorkOrders: [{
    id: "wo-1",
    title: "Refresh stale context",
    status: "READY",
    contextBindingStatus: "STALE",
    contextBoundAt: nowIso,
    localDocumentSnapshotId: "snap-old",
    boundToLatestSnapshot: false
  }]
};

const activeWorkOrder = {
  id: "wo-1",
  title: "Refresh stale context",
  status: "READY",
  contextBindingStatus: "STALE"
} as WorkOrderDto;

const apiMocks = vi.hoisted(() => ({
  projects: vi.fn(),
  projectWorkOrders: vi.fn(),
  getProjectContextHealth: vi.fn(),
  getProjectLocalDocs: vi.fn(),
  scanProjectLocalDocumentRoot: vi.fn(),
  rebindProjectContexts: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser })
}));

function setUser(role: PublicUser["role"]) {
  currentUser = { id: "user-1", email: `${role.toLowerCase()}@aikingdom.local`, displayName: role, role };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  currentUser = null;
});

describe("ProjectsPage", () => {
  it("renders project cards with context health and active work count", async () => {
    setUser("KING");
    apiMocks.projects.mockResolvedValue({ projects: [project] });
    apiMocks.projectWorkOrders.mockResolvedValue({ workOrders: [activeWorkOrder] });
    apiMocks.getProjectContextHealth.mockResolvedValue(staleHealth);

    renderPage();

    expect((await screen.findAllByText("Castle Keep")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Context STALE")).toBeInTheDocument();
    expect(screen.getAllByText("Active work: 1").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Project Context/i })).toHaveAttribute("href", "/projects/proj-1");
    expect(screen.getAllByRole("link", { name: /Kingdom Inbox/i }).some((link) => link.getAttribute("href") === "/inbox")).toBe(true);
  });

  it("shows shortcut icons and runs a local docs scan from the selected project", async () => {
    setUser("KING");
    apiMocks.projects.mockResolvedValue({ projects: [project] });
    apiMocks.projectWorkOrders.mockResolvedValue({ workOrders: [activeWorkOrder] });
    apiMocks.getProjectContextHealth.mockResolvedValue(staleHealth);
    apiMocks.getProjectLocalDocs.mockResolvedValue({
      roots: [{ id: "root-1", isActive: true }],
      snapshot: null
    });
    apiMocks.scanProjectLocalDocumentRoot.mockResolvedValue({ id: "snap-1" });

    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Run Local Docs Scan" }));

    await waitFor(() => expect(apiMocks.scanProjectLocalDocumentRoot).toHaveBeenCalledWith("proj-1", "root-1"));
    expect(await screen.findByText("Local docs scan complete.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Work Orders" })).toHaveAttribute("href", "/work-orders");
    expect(screen.getByRole("link", { name: "Open Artifacts / Local Docs" })).toHaveAttribute("href", "/artifacts");
  });

  it("renders an empty state when no projects match filters", async () => {
    setUser("KING");
    apiMocks.projects.mockResolvedValue({ projects: [] });

    renderPage();

    expect(await screen.findByText("No projects found")).toBeInTheDocument();
    expect(screen.getByText("Create a project or clear filters to see project context health here.")).toBeInTheDocument();
  });

  it("renders an error state with retry when projects fail to load", async () => {
    setUser("KING");
    apiMocks.projects.mockRejectedValue(new Error("Project API failed"));

    renderPage();

    expect(await screen.findByText("Projects unavailable")).toBeInTheDocument();
    expect(screen.getByText("Project API failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });

  it("keeps project mutation behind explicit create and edit dialogs", async () => {
    setUser("KING");
    apiMocks.projects.mockResolvedValue({ projects: [project] });
    apiMocks.projectWorkOrders.mockResolvedValue({ workOrders: [activeWorkOrder] });
    apiMocks.getProjectContextHealth.mockResolvedValue(staleHealth);

    renderPage();

    expect((await screen.findAllByText("Castle Keep")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit project" }));
    expect(screen.getByRole("dialog", { name: "Edit project" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Castle Keep")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close project editor" }));
    await userEvent.click(screen.getByRole("button", { name: "Create Project" }));
    expect(screen.getByRole("dialog", { name: "Create project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Project" })).toBeInTheDocument();
  });

  it("presents a compact portfolio summary before the selected project workspace", async () => {
    setUser("KING");
    apiMocks.projects.mockResolvedValue({ projects: [project] });
    apiMocks.projectWorkOrders.mockResolvedValue({ workOrders: [activeWorkOrder] });
    apiMocks.getProjectContextHealth.mockResolvedValue(staleHealth);

    renderPage();

    expect(await screen.findByRole("region", { name: "Project portfolio" })).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect((await screen.findAllByRole("link", { name: "Open project workspace" })).some((link) => link.getAttribute("href") === "/projects/proj-1")).toBe(true);
  });
});
