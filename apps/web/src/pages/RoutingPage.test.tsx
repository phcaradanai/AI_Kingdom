import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type {
  ProviderModelSnapshotDto,
  ProviderRegistryDto,
  RouteChainDto,
} from "@/types/api";
import { RoutingPage } from "./RoutingPage";

const nowIso = "2026-06-26T09:00:00.000Z";

const providers: ProviderRegistryDto[] = [
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
    balance: 19.96,
    spend: 0.04,
    lastSyncAt: nowIso,
    modelCount: 2,
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

const chains: RouteChainDto[] = [
  {
    id: "chain-global",
    name: "Default Balanced Chain",
    taskMode: null,
    agentId: null,
    scope: "GLOBAL",
    isActive: true,
    description: "Default production route",
    createdAt: nowIso,
    updatedAt: nowIso,
    entries: [
      {
        id: "entry-1",
        chainId: "chain-global",
        sequence: 1,
        providerId: "openrouter",
        model: "openai/gpt-4o-mini",
        isEnabled: true,
        notes: "Primary production provider",
      },
      {
        id: "entry-2",
        chainId: "chain-global",
        sequence: 2,
        providerId: "local-sandbox-baseline",
        model: "local-sandbox-baseline",
        isEnabled: true,
        notes: null,
      },
    ],
  },
  {
    id: "chain-build",
    name: "Build Safety Chain",
    taskMode: "BUILD",
    agentId: null,
    scope: "TASK_MODE",
    isActive: false,
    description: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    entries: [
      {
        id: "entry-3",
        chainId: "chain-build",
        sequence: 1,
        providerId: "local-sandbox-baseline",
        model: "local-sandbox-baseline",
        isEnabled: true,
        notes: null,
      },
    ],
  },
];

const models: ProviderModelSnapshotDto[] = [
  {
    id: "model-1",
    providerType: "openrouter",
    modelId: "openai/gpt-4o-mini",
    modelName: "GPT-4o mini",
    contextWindow: 128000,
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    isAvailable: true,
    syncedAt: nowIso,
    createdAt: nowIso,
  },
];

const apiMocks = vi.hoisted(() => ({
  routeChains: vi.fn(),
  treasuryProviderRegistry: vi.fn(),
  providerModels: vi.fn(),
  createRouteChain: vi.fn(),
  updateRouteChain: vi.fn(),
  deleteRouteChain: vi.fn(),
  duplicateRouteChain: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

function setup(options: { modelCatalogError?: boolean; routeError?: boolean } = {}) {
  apiMocks.routeChains.mockResolvedValue({ routeChains: chains });
  apiMocks.treasuryProviderRegistry.mockResolvedValue({ providers });
  apiMocks.providerModels.mockResolvedValue({ models, lastSyncedAt: nowIso });
  apiMocks.createRouteChain.mockResolvedValue({
    routeChain: {
      ...chains[0]!,
      id: "chain-new",
      name: "Research Chain",
      entries: [
        {
          ...chains[0]!.entries[0]!,
          id: "entry-new",
          chainId: "chain-new",
          model: "deepseek/deepseek-chat",
        },
      ],
    },
  });
  apiMocks.updateRouteChain.mockImplementation((id: string, payload: Partial<RouteChainDto>) =>
    Promise.resolve({
      routeChain: {
        ...chains.find((chain) => chain.id === id)!,
        ...payload,
        updatedAt: nowIso,
      },
    }),
  );
  apiMocks.deleteRouteChain.mockResolvedValue({ ok: true });
  apiMocks.duplicateRouteChain.mockResolvedValue({
    routeChain: { ...chains[0]!, id: "chain-copy", name: "Default Balanced Chain copy" },
  });
  if (options.modelCatalogError) {
    apiMocks.providerModels.mockRejectedValueOnce(new Error("Model sync failed"));
  }
  if (options.routeError) {
    apiMocks.routeChains.mockRejectedValueOnce(new Error("Route API failed"));
  }
}

function renderPage(language: "en" | "th" = "en") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  return render(
    <I18nProvider>
      <MemoryRouter>
        <RoutingPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("RoutingPage", () => {
  it("renders route-chain workspace with selected fallback evidence and source links", async () => {
    setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Routing Workspace" })).toBeInTheDocument();
    expect(screen.getByText("Default Balanced Chain")).toBeInTheDocument();
    expect(screen.getByText("Build Safety Chain")).toBeInTheDocument();
    expect(await screen.findByText("Fallback Sequence")).toBeInTheDocument();
    expect(screen.getAllByText(/gpt-4o-mini/i)[0]).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sources" }));
    expect(screen.getByRole("link", { name: /Providers/i })).toHaveAttribute("href", "/providers");
    expect(screen.getByRole("link", { name: /Treasury/i })).toHaveAttribute("href", "/treasury");
    expect(screen.getByText("Usage Trace")).toBeInTheDocument();
  });

  it("creates a route chain using the existing route-chain payload shape", async () => {
    setup();
    renderPage();

    await screen.findByRole("heading", { name: "Routing Workspace" });
    await userEvent.click(screen.getByRole("button", { name: "New chain" }));

    const dialog = screen.getByRole("dialog", { name: "Create route chain" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Research Chain");
    await userEvent.selectOptions(within(dialog).getByLabelText("Scope"), "TASK_MODE");
    await userEvent.selectOptions(within(dialog).getByLabelText("Task mode"), "RESEARCH");
    await userEvent.selectOptions(within(dialog).getByLabelText("Provider 1"), "openrouter");
    await userEvent.type(within(dialog).getByLabelText("Model 1"), "deepseek/deepseek-chat");
    await userEvent.type(within(dialog).getByLabelText("Notes 1"), "Research fallback");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create chain" }));

    await waitFor(() => expect(apiMocks.createRouteChain).toHaveBeenCalledTimes(1));
    expect(apiMocks.createRouteChain).toHaveBeenCalledWith({
      name: "Research Chain",
      taskMode: "RESEARCH",
      scope: "TASK_MODE",
      description: null,
      entries: [
        {
          providerId: "openrouter",
          model: "deepseek/deepseek-chat",
          isEnabled: true,
          notes: "Research fallback",
        },
      ],
    });
  });

  it("shows partial model-catalog failure without hiding route-chain evidence", async () => {
    setup({ modelCatalogError: true });
    renderPage();

    expect(await screen.findByText("Default Balanced Chain")).toBeInTheDocument();
    expect(screen.getByText(/Model catalog is unavailable/i)).toBeInTheDocument();
  });

  it("renders Thai chrome from semantic routing keys", async () => {
    setup();
    renderPage("th");

    expect(await screen.findByRole("heading", { name: "พื้นที่จัดการเส้นทางโมเดล" })).toBeInTheDocument();
    expect(screen.getByText("สร้าง chain")).toBeInTheDocument();
    expect(screen.getByText(/Routing เป็นเจ้าของลำดับ/i)).toBeInTheDocument();
  });

  it("shows route-chain API errors as page errors", async () => {
    setup({ routeError: true });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Route API failed");
  });
});
