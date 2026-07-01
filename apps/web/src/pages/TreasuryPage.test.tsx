import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type {
  ProviderRegistryDto,
  TreasuryAttentionTraceDto,
  TreasuryOverviewDto,
  TreasuryProviderDto,
  UsageRecordDto,
} from "@/types/api";
import { TreasuryPage } from "./TreasuryPage";

const nowIso = "2026-07-01T09:00:00.000Z";

const overview: TreasuryOverviewDto = {
  costToday: 0.25,
  costThisMonth: 1.5,
  costAllTime: 2.75,
  totalTokensToday: 12_500,
  totalTokensThisMonth: 82_000,
  totalTokensAllTime: 150_000,
  totalCallsAllTime: 24,
  totalTasksTracked: 4,
  totalSessionsTracked: 3,
  latestProviderBalances: [],
  deepseekEstimatedSpendToday: 0,
  deepseekEstimatedSpendThisMonth: 0,
  latestDeepSeekBalance: null,
  balanceLastFetchedAt: null,
  reconciliationStatus: "NO_BALANCE_SNAPSHOT",
  balanceDelta: null,
  budgetStatus: {
    dailyLimit: 5,
    monthlyLimit: 100,
    dailyWarning: false,
    monthlyWarning: false,
  },
  providerTelemetry: {
    accountSnapshots: [],
    healthSnapshots: [],
    lastModelSyncedAt: nowIso,
  },
};

const registry: ProviderRegistryDto[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    type: "openrouter",
    isActive: true,
    isFreeTier: false,
    environmentMode: "PRODUCTION",
    costTier: "MEDIUM",
    hasCredentials: true,
    status: "ACTIVE",
    healthStatus: "HEALTHY",
    balance: 19.5,
    spend: 1.25,
    lastSyncAt: nowIso,
    modelCount: 1,
    defaultModel: "openai/gpt-4o-mini",
  },
  {
    id: "local-sandbox-baseline",
    name: "Local Sandbox Baseline",
    type: "sandbox",
    isActive: true,
    isFreeTier: true,
    environmentMode: "SANDBOX",
    costTier: "FREE",
    hasCredentials: true,
    status: "SANDBOX",
    healthStatus: "HEALTHY",
    balance: null,
    spend: 0,
    lastSyncAt: nowIso,
    modelCount: 1,
    defaultModel: "local-sandbox-baseline",
  },
];

const providerRows: TreasuryProviderDto[] = [
  {
    provider: "openrouter",
    providerId: "openrouter",
    model: "openai/gpt-4o-mini",
    totalCostUSD: 1.25,
    totalTokens: 75_000,
    promptTokens: 50_000,
    completionTokens: 25_000,
    callCount: 12,
  },
  {
    provider: "sandbox",
    providerId: "local-sandbox-baseline",
    model: "local-sandbox-baseline",
    totalCostUSD: 0,
    totalTokens: 2_000,
    promptTokens: 1_000,
    completionTokens: 1_000,
    callCount: 2,
  },
];

const attentionTraces: TreasuryAttentionTraceDto[] = [
  {
    traceId: "trace-failed",
    status: "COMPLETED",
    operation: "council_response",
    purpose: "Generate council response",
    providerId: "openrouter",
    providerType: "openrouter",
    providerName: "OpenRouter",
    model: "openai/gpt-4o-mini",
    startedAt: nowIso,
    failedAt: null,
    totalCostUSD: 0.75,
    totalTokens: 6_000,
    usageRecordCount: 1,
    failureCount: 1,
    attentionKind: "FAILED",
  },
];

const usageRecords: UsageRecordDto[] = [
  {
    id: "usage-1",
    traceId: "trace-failed",
    attributionStatus: "TRUSTED",
    projectId: null,
    taskId: null,
    councilSessionId: null,
    agentId: null,
    purpose: "Generate council response",
    operation: "council_response",
    sourceType: "TASK",
    sourceId: "task-1",
    requestLabel: null,
    promptPreview: null,
    responsePreview: null,
    provider: "openrouter",
    providerId: "openrouter",
    model: "openai/gpt-4o-mini",
    promptTokens: 4_000,
    completionTokens: 2_000,
    totalTokens: 6_000,
    estimatedCostUSD: 0.75,
    currency: "USD",
    createdAt: nowIso,
  },
];

const apiMocks = vi.hoisted(() => ({
  treasuryOverview: vi.fn(),
  treasuryByProvider: vi.fn(),
  treasuryProviderRegistry: vi.fn(),
  treasuryReports: vi.fn(),
  treasuryMonthly: vi.fn(),
  treasuryFallbackAnalytics: vi.fn(),
  treasuryUsage: vi.fn(),
  treasuryAttentionTraces: vi.fn(),
  latestReconciliation: vi.fn(),
  modelPricing: vi.fn(),
  treasuryPricingWarnings: vi.fn(),
  syncOpenRouterAccount: vi.fn(),
  syncOpenRouterModels: vi.fn(),
  computeProviderHealth: vi.fn(),
  syncDeepSeekBalance: vi.fn(),
  runReconciliation: vi.fn(),
  createModelPricing: vi.fn(),
  updateModelPricing: vi.fn(),
  deleteModelPricing: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

function setup(options: { empty?: boolean; traceFailure?: boolean; budgetWarning?: boolean } = {}) {
  const nextOverview = options.empty
    ? {
        ...overview,
        costToday: 0,
        costThisMonth: 0,
        costAllTime: 0,
        totalTokensToday: 0,
        totalTokensThisMonth: 0,
        totalTokensAllTime: 0,
        totalCallsAllTime: 0,
        budgetStatus: { dailyLimit: null, monthlyLimit: null, dailyWarning: false, monthlyWarning: false },
      }
    : options.budgetWarning
    ? { ...overview, costToday: 6, budgetStatus: { ...overview.budgetStatus, dailyWarning: true } }
    : overview;
  apiMocks.treasuryOverview.mockResolvedValue(nextOverview);
  apiMocks.treasuryByProvider.mockResolvedValue({ providers: options.empty ? [] : providerRows });
  apiMocks.treasuryProviderRegistry.mockResolvedValue({ providers: options.empty ? [] : registry });
  apiMocks.treasuryReports.mockResolvedValue({ daily: options.empty ? [] : [{ date: "2026-07-01", totalCostUSD: 0.25, totalTokens: 12_500, callCount: 3 }] });
  apiMocks.treasuryMonthly.mockResolvedValue({ monthly: options.empty ? [] : [{ month: "2026-07", totalCostUSD: 1.5, totalTokens: 82_000, callCount: 24 }] });
  apiMocks.treasuryFallbackAnalytics.mockResolvedValue({ analytics: [] });
  apiMocks.treasuryUsage.mockResolvedValue({ records: options.empty ? [] : usageRecords });
  apiMocks.treasuryAttentionTraces.mockResolvedValue({ traces: options.empty ? [] : attentionTraces });
  if (options.traceFailure) apiMocks.treasuryAttentionTraces.mockRejectedValueOnce(new Error("Trace telemetry unavailable"));
  apiMocks.latestReconciliation.mockResolvedValue({ snapshot: null });
  apiMocks.modelPricing.mockResolvedValue({ modelPricing: [] });
  apiMocks.treasuryPricingWarnings.mockResolvedValue({ unknownPricingUsageCount: 0, unknownModels: [], estimatedPricingUsageCount: 0, estimatedModels: [] });
}

function renderPage(language: "en" | "th" = "en") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  return render(
    <I18nProvider>
      <MemoryRouter>
        <TreasuryPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("TreasuryPage", () => {
  it("shows a stable loading state", () => {
    setup();
    apiMocks.treasuryOverview.mockImplementationOnce(() => new Promise(() => undefined));
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Loading treasury evidence...");
  });

  it("shows honest empty states without mock financial data", async () => {
    setup({ empty: true });
    renderPage();
    expect(await screen.findByText("No provider spend has been recorded yet")).toBeInTheDocument();
    expect(screen.getByText("No expensive or failed usage traces are available")).toBeInTheDocument();
    expect(screen.getAllByText("No limit configured").length).toBeGreaterThan(0);
  });

  it("keeps available evidence visible when trace telemetry fails", async () => {
    setup({ traceFailure: true });
    renderPage();
    expect(await screen.findByText("Some financial telemetry is unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("OpenRouter").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$1.25").length).toBeGreaterThan(0);
  });

  it("shows provider spend and selected model evidence", async () => {
    setup();
    renderPage();
    expect(await screen.findByRole("button", { name: "Select OpenRouter" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("$1.25").length).toBeGreaterThan(0);
    expect(screen.getByText("openai/gpt-4o-mini")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Select Local Sandbox Baseline" }));
    expect(screen.getByRole("button", { name: "Select Local Sandbox Baseline" })).toHaveAttribute("aria-pressed", "true");
  });

  it("links directly to usage, provider, routing, and audit sources", async () => {
    setup();
    renderPage();
    expect(await screen.findByRole("link", { name: "Open latest usage trace" })).toHaveAttribute("href", "/usage-traces/trace-failed");
    expect(screen.getByRole("link", { name: "Open provider configuration" })).toHaveAttribute("href", "/providers");
    expect(screen.getByRole("link", { name: "Open route chain" })).toHaveAttribute("href", "/routing");
    expect(screen.getByRole("link", { name: /Audit/ })).toHaveAttribute("href", "/audit");
  });

  it("surfaces budget and failed-trace risk in the top summary", async () => {
    setup({ budgetWarning: true });
    renderPage();
    await waitFor(() => expect(screen.getByText("Spend today")).toBeInTheDocument());
    expect(screen.getByText("Limit reached")).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getAllByText(/Limit reached; review Routing/).length).toBeGreaterThan(0);
  });

  it("uses semantic English and Thai labels", async () => {
    setup();
    const view = renderPage("en");
    expect(await screen.findByRole("heading", { name: "Royal Treasury" })).toBeInTheDocument();
    expect(screen.getByText("Provider spend registry")).toBeInTheDocument();
    view.unmount();
    vi.clearAllMocks();
    setup();
    renderPage("th");
    expect(await screen.findByRole("heading", { name: "ท้องพระคลัง" })).toBeInTheDocument();
    expect(screen.getByText("ทะเบียนค่าใช้จ่ายผู้ให้บริการ")).toBeInTheDocument();
  });
});
