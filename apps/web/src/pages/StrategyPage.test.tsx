import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type {
  ArtifactDto,
  KingdomAssetDto,
  KingdomObjectiveDto,
  KingdomOpportunityDto,
  PublicUser,
  RevenueStreamDto,
  StrategyOverviewDto,
} from "@/types/api";
import { StrategyPage } from "./StrategyPage";

const now = "2026-06-22T08:00:00.000Z";

const objective: KingdomObjectiveDto = {
  id: "objective-1",
  projectId: "project-1",
  title: "Establish recurring revenue",
  description: "Prove one durable revenue path.",
  status: "ACTIVE",
  priority: "HIGH",
  targetDate: null,
  sourceType: "REPORT",
  sourceId: "report-1",
  tags: ["revenue"],
  createdByUserId: "user-1",
  createdAt: now,
  updatedAt: now,
  project: { id: "project-1", name: "Kingdom Core", codename: "CORE" },
  createdBy: {
    id: "user-1",
    displayName: "The King",
    email: "king@example.com",
  },
  successMetrics: [],
};

const opportunity: KingdomOpportunityDto = {
  id: "opportunity-1",
  projectId: "project-1",
  objectiveId: "objective-1",
  assetId: null,
  title: "Premium council reports",
  problem: "Advice is difficult to package.",
  proposedValue: "Deliver a recurring executive brief.",
  targetCustomer: "AI operators",
  status: "VALIDATING",
  priority: "HIGH",
  confidence: 0.72,
  score: 84,
  estimatedMonthlyRevenue: 3200,
  estimatedEffort: "Medium",
  riskLevel: "MEDIUM",
  nextAction: "Run a paid pilot.",
  sourceType: "ARTIFACT",
  sourceId: "artifact-1",
  traceId: "trace-1",
  tags: ["pilot"],
  createdByUserId: "user-1",
  reviewedByUserId: null,
  reviewedAt: null,
  createdAt: now,
  updatedAt: now,
  project: objective.project,
  objective: {
    id: objective.id,
    title: objective.title,
    status: objective.status,
  },
  asset: null,
  experiments: [],
};

const asset: KingdomAssetDto = {
  id: "asset-1",
  projectId: "project-1",
  name: "Council Briefing Engine",
  type: "AUTOMATION",
  status: "MONETIZING",
  description: "Produces grounded executive briefs.",
  valueHypothesis: "Operators pay for decision-ready output.",
  targetCustomer: "AI operators",
  monthlyRevenueEstimate: 3200,
  monthlyCostEstimate: 400,
  sourceType: "ARTIFACT",
  sourceId: "artifact-1",
  tags: ["briefing"],
  createdAt: now,
  updatedAt: now,
  project: objective.project,
  revenueStreams: [],
};

const revenueStream: RevenueStreamDto = {
  id: "revenue-1",
  projectId: "project-1",
  assetId: "asset-1",
  name: "Council Pro",
  model: "SUBSCRIPTION",
  status: "TESTING",
  currency: "USD",
  monthlyRevenue: 3200,
  monthlyCost: 400,
  confidence: 0.72,
  notes: "Pilot cohort",
  sourceType: "REPORT",
  sourceId: "report-1",
  createdAt: now,
  updatedAt: now,
  project: objective.project,
  asset: {
    id: asset.id,
    name: asset.name,
    status: asset.status,
    type: asset.type,
  },
};

const artifact = {
  id: "artifact-1",
  projectId: "project-1",
  title: "Council report market study",
  type: "MARKET_RESEARCH",
  content: "Operators need concise, sourced advice.",
  sourceType: "REPORT",
  sourceId: "report-1",
  tags: ["research"],
  dataSource: "report",
  dataQuality: "TRUSTED",
  provenance: {},
  traceId: "trace-1",
  createdBySystem: true,
  createdAt: now,
  updatedAt: now,
  project: objective.project,
  sourceLink: {
    label: "Open report",
    href: "/reports",
    title: "Market study report",
  },
} as ArtifactDto;

const overview: StrategyOverviewDto = {
  computedAt: now,
  objectives: { active: 1, atRiskMetrics: 0, achieved: 0, archived: 0 },
  assets: {
    active: 0,
    monetizing: 1,
    ideas: 0,
    totalEstimatedMonthlyRevenue: 3200,
    totalEstimatedMonthlyCost: 400,
  },
  revenue: {
    activeStreams: 0,
    testingStreams: 1,
    monthlyRevenue: 3200,
    monthlyCost: 400,
    monthlyNet: 2800,
  },
  opportunities: {
    inbox: 0,
    reviewing: 0,
    validating: 1,
    approved: 0,
    rejected: 0,
    top: [opportunity],
  },
  activeObjectives: [objective],
  atRiskMetrics: [],
  activeRevenueStreams: [revenueStream],
};

const apiMocks = vi.hoisted(() => ({
  getStrategyOverview: vi.fn(),
  strategyObjectives: vi.fn(),
  strategyOpportunities: vi.fn(),
  strategyAssets: vi.fn(),
  strategyRevenueStreams: vi.fn(),
  artifacts: vi.fn(),
  createStrategyObjective: vi.fn(),
  updateStrategyObjective: vi.fn(),
  createStrategyOpportunity: vi.fn(),
  updateStrategyOpportunity: vi.fn(),
  createStrategyAsset: vi.fn(),
  updateStrategyAsset: vi.fn(),
  createStrategyRevenueStream: vi.fn(),
  updateStrategyRevenueStream: vi.fn(),
  createStrategyOpportunityWorkOrder: vi.fn(),
  createStrategyOpportunityFromArtifact: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let currentUser: PublicUser | null = null;
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: PublicUser | null }) => unknown) => selector({ user: currentUser }),
}));

function setUser(role: PublicUser["role"]) {
  currentUser = {
    id: "user-1",
    email: "king@example.com",
    displayName: "The King",
    role,
  };
}

function mockLoad() {
  apiMocks.getStrategyOverview.mockResolvedValue({ overview });
  apiMocks.strategyObjectives.mockResolvedValue({ objectives: [objective] });
  apiMocks.strategyOpportunities.mockResolvedValue({
    opportunities: [opportunity],
  });
  apiMocks.strategyAssets.mockResolvedValue({ assets: [asset] });
  apiMocks.strategyRevenueStreams.mockResolvedValue({
    revenueStreams: [revenueStream],
  });
  apiMocks.artifacts.mockResolvedValue({ artifacts: [artifact] });
}

function renderPage(language: "en" | "th" = "en") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  return render(
    <MemoryRouter>
      <StrategyPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  currentUser = null;
});

describe("StrategyPage", () => {
  it("leads with a compact strategic overview and stable section navigation", async () => {
    setUser("KING");
    mockLoad();
    renderPage();

    expect(await screen.findByRole("region", { name: "Strategic overview" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Strategy sections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("$2,800")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Objective title")).not.toBeInTheDocument();
  });

  it("keeps creation behind a focused dialog", async () => {
    setUser("KING");
    mockLoad();
    apiMocks.createStrategyObjective.mockResolvedValue({ objective });
    renderPage();

    await screen.findByRole("region", { name: "Strategic overview" });
    await userEvent.click(screen.getByRole("button", { name: "Objectives" }));
    await userEvent.click(screen.getByRole("button", { name: "New objective" }));
    expect(screen.getByRole("dialog", { name: "Create objective" })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Objective title"), "Expand treasury runway");
    await userEvent.click(screen.getByRole("button", { name: "Save objective" }));
    await waitFor(() =>
      expect(apiMocks.createStrategyObjective).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Expand treasury runway" }),
      ),
    );
  });

  it("keeps source ownership and related records directly navigable", async () => {
    setUser("KING");
    mockLoad();
    renderPage();

    await screen.findByRole("region", { name: "Strategic overview" });
    await userEvent.click(screen.getByRole("button", { name: "Opportunities" }));
    expect(screen.getByRole("link", { name: "Open owning project" })).toHaveAttribute("href", "/projects/project-1");
    expect(screen.getByRole("link", { name: "Open source record" })).toHaveAttribute("href", "/artifacts");
    expect(screen.getByRole("link", { name: "Open usage trace" })).toHaveAttribute("href", "/usage-traces/trace-1");
  });

  it("edits an existing record through the same focused dialog", async () => {
    setUser("KING");
    mockLoad();
    apiMocks.updateStrategyObjective.mockResolvedValue({ objective });
    renderPage();

    await screen.findByRole("region", { name: "Strategic overview" });
    await userEvent.click(screen.getByRole("button", { name: "Objectives" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit objective" }));
    expect(screen.getByRole("dialog", { name: "Edit objective" })).toBeInTheDocument();

    const title = screen.getByLabelText("Objective title");
    await userEvent.clear(title);
    await userEvent.type(title, "Establish durable revenue");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(apiMocks.updateStrategyObjective).toHaveBeenCalledWith(
        "objective-1",
        expect.objectContaining({ title: "Establish durable revenue" }),
      ),
    );
  });

  it("renders semantic Thai chrome without changing source data", async () => {
    setUser("KING");
    mockLoad();
    renderPage("th");

    expect(await screen.findByRole("heading", { name: "บัญชีกลยุทธ์" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "หมวดกลยุทธ์" })).toBeInTheDocument();
    expect(screen.getByText("Premium council reports")).toBeInTheDocument();
  });

  it("keeps mutation controls hidden for read-only roles", async () => {
    setUser("SCRIBE");
    mockLoad();
    renderPage();

    expect(await screen.findByText("Read-only strategy access")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New objective" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit objective" })).not.toBeInTheDocument();
  });
});
