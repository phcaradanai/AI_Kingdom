import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactDto, ProjectDto, PublicUser } from "@/types/api";
import { ArtifactsPage } from "./ArtifactsPage";

const nowIso = new Date().toISOString();
const project: ProjectDto = {
  id: "proj-1", name: "Castle Keep", codename: "KEEP", description: "Core kingdom project", status: "ACTIVE", priority: "HIGH",
  goals: [], keywords: [], aliases: [], repositoryUrl: null, localPath: null, activeMilestone: null, ownerUserId: null, createdAt: nowIso, updatedAt: nowIso
};
const artifact: ArtifactDto = {
  id: "artifact-1", projectId: "proj-1", title: "Castle implementation report", type: "IMPLEMENTATION_REPORT", content: "Validation passed with source evidence.",
  sourceType: "WORK_ORDER", sourceId: "wo-1", tags: ["validation", "castle"], dataSource: "work_order", dataQuality: "REVIEW_REQUIRED",
  provenance: { rootPath: "/Users/private/secret-project", command: "npm test" }, traceId: "trace-1", createdBySystem: true,
  humanReadableSource: "Work Order: Fortify Castle", sourceLink: { label: "Work Order", title: "Fortify Castle", href: "/work-orders/wo-1", type: "WORK_ORDER", id: "wo-1" },
  duplicateKey: "castle|report", isDuplicate: true, createdAt: nowIso, updatedAt: nowIso, project
};

const apiMocks = vi.hoisted(() => ({
  projects: vi.fn(), artifacts: vi.fn(), createArtifact: vi.fn(), updateArtifact: vi.fn(), archiveDuplicateArtifact: vi.fn(), deleteArtifact: vi.fn()
}));
vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({ useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser }) }));

function setUser(role: PublicUser["role"]) { currentUser = { id: "user-1", email: `${role.toLowerCase()}@example.com`, displayName: role, role }; }
function renderPage() { return render(<MemoryRouter><ArtifactsPage /></MemoryRouter>); }

beforeEach(() => {
  localStorage.clear();
  setUser("KING");
  apiMocks.projects.mockResolvedValue({ projects: [project] });
  apiMocks.artifacts.mockResolvedValue({ artifacts: [artifact] });
  apiMocks.archiveDuplicateArtifact.mockResolvedValue({ artifact: { ...artifact, tags: [...artifact.tags, "archived-duplicate"] } });
  apiMocks.deleteArtifact.mockResolvedValue(undefined);
});

afterEach(() => { vi.clearAllMocks(); currentUser = null; localStorage.clear(); });

describe("ArtifactsPage", () => {
  it("renders an archive and reading pane with project, source, and trace ownership", async () => {
    renderPage();
    expect(await screen.findByRole("region", { name: "Artifact archive" })).toBeInTheDocument();
    expect(screen.getByText("Validation passed with source evidence.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Work Order/ })).toHaveAttribute("href", "/work-orders/wo-1");
    expect(screen.getByRole("link", { name: /Owning project/ })).toHaveAttribute("href", "/projects/proj-1");
    expect(screen.getByRole("link", { name: /Usage trace/ })).toHaveAttribute("href", "/usage-traces/trace-1");
    expect(screen.queryByText("/Users/private/secret-project")).not.toBeInTheDocument();
  });

  it("keeps artifact creation and editing inside explicit dialogs", async () => {
    renderPage();
    expect((await screen.findAllByText("Castle implementation report")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit artifact" }));
    expect(screen.getByRole("dialog", { name: "Edit artifact" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Castle implementation report")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close artifact editor" }));
    await userEvent.click(screen.getByRole("button", { name: "Create Artifact" }));
    expect(screen.getByRole("dialog", { name: "Create artifact" })).toBeInTheDocument();
  });

  it("mirrors create and update RBAC for ministers", async () => {
    setUser("MINISTER");
    renderPage();
    expect(await screen.findByRole("button", { name: "Create Artifact" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit artifact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete artifact" })).not.toBeInTheDocument();
  });

  it("requires an explicit destructive confirmation before deletion", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Delete artifact" }));
    expect(screen.getByRole("dialog", { name: "Delete artifact?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));
    await waitFor(() => expect(apiMocks.deleteArtifact).toHaveBeenCalledWith("artifact-1"));
  });
});
