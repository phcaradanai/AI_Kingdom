import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalDocumentRootDto, LocalDocumentSnapshotDto, ProjectOverviewDto, PublicUser } from "@/types/api";
import { ProjectDetailPage } from "./ProjectDetailPage";

const nowIso = new Date().toISOString();

const overview: ProjectOverviewDto = {
  project: {
    id: "proj-1",
    name: "Castle Keep",
    codename: null,
    description: "A test project",
    status: "ACTIVE",
    priority: "MEDIUM",
    goals: [],
    keywords: [],
    aliases: [],
    repositoryUrl: null,
    localPath: null,
    activeMilestone: null,
    ownerUserId: null,
    createdAt: nowIso,
    updatedAt: nowIso
  },
  counts: { tasks: 0, matters: 0, workOrders: 0, reports: 0, memories: 0, artifacts: 0, criticalMatters: 0 }
};

const mockRoot: LocalDocumentRootDto = {
  id: "root-1",
  projectId: "proj-1",
  name: "main-repo",
  rootPath: "/Users/king/castle",
  rootPathHash: "a".repeat(64),
  isActive: true,
  allowedGlobs: ["README.md"],
  blockedGlobs: [".env"],
  maxFileBytes: 200000,
  maxTotalBytes: 5000000,
  lastScannedAt: nowIso,
  lastError: null,
  createdAt: nowIso,
  updatedAt: nowIso
};

const mockSnapshot: LocalDocumentSnapshotDto = {
  id: "snap-1",
  projectId: "proj-1",
  localDocumentRootId: "root-1",
  scanStatus: "READY",
  scannedAt: nowIso,
  fileCount: 12,
  totalBytes: 34567,
  summary: "12 files scanned (34567 bytes).",
  importantFiles: [{ relativePath: "README.md", fileType: "markdown" }],
  detectedStack: ["Express", "TypeScript"],
  packageScripts: { dev: "vite", test: "vitest" },
  riskZones: [{ relativePath: "apps/api/src/services/authService.ts", riskLevel: "HIGH", reason: "Authentication-related path" }],
  provenance: { rootId: "root-1" },
  isStale: false,
  createdAt: nowIso
};

const apiMocks = vi.hoisted(() => ({
  projectOverview: vi.fn(),
  projectTasks: vi.fn(),
  projectMatters: vi.fn(),
  projectWorkOrders: vi.fn(),
  projectReports: vi.fn(),
  projectMemories: vi.fn(),
  projectArtifacts: vi.fn(),
  exportProjectObsidian: vi.fn(),
  getProjectRepositorySnapshot: vi.fn(),
  scanProjectRepository: vi.fn(),
  getProjectLocalDocs: vi.fn(),
  addProjectLocalDocumentRoot: vi.fn(),
  scanProjectLocalDocumentRoot: vi.fn(),
  readProjectLocalDocumentFile: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser })
}));

function setUser(role: PublicUser["role"]) {
  currentUser = { id: "user-1", email: `${role.toLowerCase()}@aikingdom.local`, displayName: role, role };
}

function mockBaseApi(localDocs: { roots: LocalDocumentRootDto[]; snapshot: LocalDocumentSnapshotDto | null }) {
  apiMocks.projectOverview.mockResolvedValue(overview);
  apiMocks.projectTasks.mockResolvedValue({ tasks: [] });
  apiMocks.projectMatters.mockResolvedValue({ matters: [] });
  apiMocks.projectWorkOrders.mockResolvedValue({ workOrders: [] });
  apiMocks.projectReports.mockResolvedValue({ reports: [] });
  apiMocks.projectMemories.mockResolvedValue({ memories: [] });
  apiMocks.projectArtifacts.mockResolvedValue({ artifacts: [] });
  apiMocks.getProjectRepositorySnapshot.mockResolvedValue({ snapshot: null });
  apiMocks.getProjectLocalDocs.mockResolvedValue(localDocs);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/projects/proj-1"]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  currentUser = null;
});

describe("ProjectDetailPage — Local Docs", () => {
  it("shows empty state when no roots or snapshot exist", async () => {
    setUser("KING");
    mockBaseApi({ roots: [], snapshot: null });

    renderPage();

    expect(await screen.findByText("Local Docs")).toBeInTheDocument();
    expect(screen.getByText("No local docs snapshot yet.")).toBeInTheDocument();
    expect(screen.getByText("No local document roots configured.")).toBeInTheDocument();
  });

  it("renders roots and snapshot details (docs, scripts, stack, risk zones, summary)", async () => {
    setUser("KING");
    mockBaseApi({ roots: [mockRoot], snapshot: mockSnapshot });

    renderPage();

    expect((await screen.findAllByText("main-repo")).length).toBeGreaterThan(0);
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("- dev: vite")).toBeInTheDocument();
    expect(screen.getByText("Express, TypeScript")).toBeInTheDocument();
    expect(screen.getByText(/authService\.ts \(HIGH\)/)).toBeInTheDocument();
    expect(screen.getByText("12 files scanned (34567 bytes).")).toBeInTheDocument();
  });

  it("flags a stale snapshot in the status line", async () => {
    setUser("KING");
    mockBaseApi({ roots: [mockRoot], snapshot: { ...mockSnapshot, scanStatus: "STALE", isStale: true } });

    renderPage();

    expect(await screen.findByText(/Status: STALE · STALE/)).toBeInTheDocument();
  });

  it("lets the KING add a local root through the Add Local Root form", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    mockBaseApi({ roots: [], snapshot: null });
    apiMocks.addProjectLocalDocumentRoot.mockResolvedValue({ ...mockRoot, name: "new-root" });

    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Add Local Root" }));
    await userEvent.type(screen.getByPlaceholderText(/Name \(e\.g\. main repo\)/), "new-root");
    await userEvent.type(screen.getByPlaceholderText(/Absolute path/), "/Users/king/castle");
    await userEvent.click(screen.getByRole("button", { name: "Add Root" }));

    await waitFor(() =>
      expect(apiMocks.addProjectLocalDocumentRoot).toHaveBeenCalledWith("proj-1", { name: "new-root", rootPath: "/Users/king/castle" })
    );
    expect((await screen.findAllByText("new-root")).length).toBeGreaterThan(0);
  });

  it("Scan Now triggers a scan and renders the returned snapshot", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("CROWN_PRINCE");
    mockBaseApi({ roots: [mockRoot], snapshot: null });
    apiMocks.scanProjectLocalDocumentRoot.mockResolvedValue(mockSnapshot);

    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /Scan Now/ }));

    await waitFor(() => expect(apiMocks.scanProjectLocalDocumentRoot).toHaveBeenCalledWith("proj-1", "root-1"));
    expect(await screen.findByText("12 files scanned (34567 bytes).")).toBeInTheDocument();
  });

  it("hides Add Local Root, Scan Now, and file preview from non-privileged roles", async () => {
    setUser("SCRIBE");
    mockBaseApi({ roots: [mockRoot], snapshot: mockSnapshot });

    renderPage();

    expect(await screen.findByText("main-repo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Local Root" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Scan Now/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Preview File (King only)")).not.toBeInTheDocument();
  });

  it("KING can preview a file; CROWN_PRINCE cannot see the preview section", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setUser("KING");
    mockBaseApi({ roots: [mockRoot], snapshot: mockSnapshot });
    apiMocks.readProjectLocalDocumentFile.mockResolvedValue({ relativePath: "README.md", content: "# Castle Keep docs", sizeBytes: 18 });

    const { unmount } = renderPage();

    expect(await screen.findByText("Preview File (King only)")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox"), "root-1");
    await userEvent.type(screen.getByPlaceholderText(/Relative path/), "README.md");
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() =>
      expect(apiMocks.readProjectLocalDocumentFile).toHaveBeenCalledWith("proj-1", { rootId: "root-1", relativePath: "README.md" })
    );
    expect(await screen.findByDisplayValue("# Castle Keep docs")).toBeInTheDocument();

    unmount();
    vi.clearAllMocks();
    setUser("CROWN_PRINCE");
    mockBaseApi({ roots: [mockRoot], snapshot: mockSnapshot });

    renderPage();

    expect(await screen.findByText("main-repo")).toBeInTheDocument();
    expect(screen.queryByText("Preview File (King only)")).not.toBeInTheDocument();
  });
});
