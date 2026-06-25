import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import type {
  AIProviderDto,
  ModelPricingDto,
  ProviderAccountSnapshotDto,
  ProviderHealthSnapshotDto,
  ProviderModelSnapshotDto,
} from "@/types/api";
import { ProvidersPage } from "./ProvidersPage";

const nowIso = "2026-06-24T09:00:00.000Z";

const openRouter: AIProviderDto = {
  id: "openrouter",
  name: "OpenRouter",
  type: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  defaultModel: "openai/gpt-4o-mini",
  isActive: true,
  priority: 20,
  supportsChat: true,
  supportsTools: true,
  supportsVision: true,
  supportsJsonMode: true,
  costTier: "MEDIUM",
  capabilities: {
    supportsChat: true,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
  },
  hasCredentials: true,
  environmentMode: "PRODUCTION",
  isFreeTier: false,
  modelValidationStatus: "VALID",
  lastValidationTime: nowIso,
  config: { openRouterModels: ["openai/gpt-4o-mini", "deepseek/deepseek-chat"] },
  createdAt: nowIso,
  updatedAt: nowIso,
};

const sandbox: AIProviderDto = {
  ...openRouter,
  id: "local-sandbox-baseline",
  name: "Local Sandbox Baseline",
  type: "sandbox",
  baseUrl: null,
  defaultModel: "local-sandbox-baseline",
  priority: 1000,
  costTier: "FREE",
  supportsTools: false,
  supportsVision: false,
  capabilities: { supportsChat: true, supportsJsonMode: true },
  environmentMode: "SANDBOX",
  isFreeTier: true,
  modelValidationStatus: "NOT_CHECKED",
  lastValidationTime: null,
  config: null,
};

const inactive: AIProviderDto = {
  ...openRouter,
  id: "custom-lab",
  name: "Lab Provider",
  type: "custom",
  baseUrl: "https://lab.example/v1",
  defaultModel: "lab/model",
  isActive: false,
  priority: 50,
  hasCredentials: false,
  modelValidationStatus: "NOT_CHECKED",
  lastValidationTime: null,
  config: null,
};

const health: ProviderHealthSnapshotDto[] = [
  {
    id: "health-1",
    providerType: "openrouter",
    providerId: "openrouter",
    lastSuccessAt: nowIso,
    failureRate: 0.02,
    timeoutRate: 0,
    avgDurationMs: 420,
    sampleSize: 18,
    healthStatus: "HEALTHY",
    computedAt: nowIso,
    createdAt: nowIso,
  },
  {
    id: "health-2",
    providerType: "sandbox",
    providerId: "local-sandbox-baseline",
    lastSuccessAt: nowIso,
    failureRate: 0,
    timeoutRate: 0,
    avgDurationMs: 2,
    sampleSize: 10,
    healthStatus: "HEALTHY",
    computedAt: nowIso,
    createdAt: nowIso,
  },
];

const accounts: ProviderAccountSnapshotDto[] = [
  {
    id: "account-1",
    providerType: "openrouter",
    providerId: "openrouter",
    creditsRemaining: 19.96,
    creditsUsed: 0.04,
    isFreeTier: false,
    rateLimit: null,
    status: "OK",
    syncedAt: nowIso,
    createdAt: nowIso,
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

const pricing: ModelPricingDto[] = [
  {
    id: "price-1",
    providerType: "openrouter",
    model: "openai/gpt-4o-mini",
    displayName: "GPT-4o mini",
    canonicalModel: null,
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    inputCacheHitPerMillion: null,
    inputCacheMissPerMillion: null,
    currency: "USD",
    source: "registry",
    notes: null,
    isAlias: false,
    aliasOf: null,
    isDeprecated: false,
    deprecationDate: null,
    concurrencyLimit: null,
    supportsThinking: false,
    defaultThinkingEnabled: false,
    supportedReasoningEfforts: [],
    unsupportedThinkingParams: [],
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const apiMocks = vi.hoisted(() => ({
  modelPricing: vi.fn(),
  providerHealth: vi.fn(),
  providerAccounts: vi.fn(),
  providerModels: vi.fn(),
  validateModels: vi.fn(),
}));

const storeState = vi.hoisted(() => ({
  providers: [] as AIProviderDto[],
  updateProvider: vi.fn(),
  createProvider: vi.fn(),
  deleteProvider: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));
vi.mock("@/stores/kingdomStore", () => ({
  useKingdomStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}));

function setup(options: { telemetryError?: boolean } = {}) {
  storeState.providers = [openRouter, sandbox, inactive];
  storeState.updateProvider.mockResolvedValue(openRouter);
  storeState.createProvider.mockResolvedValue(inactive);
  storeState.deleteProvider.mockResolvedValue(undefined);
  storeState.refresh.mockResolvedValue(undefined);
  apiMocks.modelPricing.mockResolvedValue({ modelPricing: pricing });
  apiMocks.providerHealth.mockResolvedValue({ health });
  apiMocks.providerAccounts.mockResolvedValue({ accounts });
  apiMocks.providerModels.mockResolvedValue({ models, lastSyncedAt: nowIso });
  apiMocks.validateModels.mockResolvedValue({ success: true });
  if (options.telemetryError) {
    apiMocks.providerHealth.mockRejectedValueOnce(new Error("Telemetry unavailable"));
  }
}

function renderPage(language: "en" | "th" = "en") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  return render(
    <I18nProvider>
      <MemoryRouter>
        <ProvidersPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("ProvidersPage registry workspace", () => {
  it("renders a compact registry, selected evidence, and canonical source links", async () => {
    setup();
    renderPage();

    expect(
      await screen.findByRole("navigation", { name: "Provider registry" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select OpenRouter" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("heading", { name: "OpenRouter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open routing policy" }),
    ).toHaveAttribute("href", "/routing");
    expect(
      screen.getByRole("link", { name: "Open provider telemetry" }),
    ).toHaveAttribute("href", "/treasury");
    expect(screen.getByText("$19.9600")).toBeInTheDocument();
  });

  it("filters providers and moves focus to the selected provider", async () => {
    setup();
    renderPage();
    await screen.findByRole("navigation", { name: "Provider registry" });

    await userEvent.type(screen.getByLabelText("Search providers"), "sandbox");
    expect(
      screen.getByRole("button", { name: "Select Local Sandbox Baseline" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Select OpenRouter" }),
    ).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Search providers"));
    await userEvent.click(
      screen.getByRole("button", { name: "Select Local Sandbox Baseline" }),
    );
    expect(
      screen.getByRole("heading", { name: "Local Sandbox Baseline" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No environment credentials required")).toBeInTheDocument();
  });

  it("keeps model validation explicit and refreshes provider state", async () => {
    setup();
    renderPage();
    await screen.findByRole("navigation", { name: "Provider registry" });

    await userEvent.click(screen.getByRole("button", { name: "Sync models" }));
    await waitFor(() => expect(apiMocks.validateModels).toHaveBeenCalledTimes(1));
    expect(storeState.refresh).toHaveBeenCalledTimes(1);
  });

  it("edits only the mutable provider registry fields", async () => {
    setup();
    renderPage();
    await screen.findByRole("navigation", { name: "Provider registry" });

    await userEvent.click(screen.getByRole("button", { name: "Edit OpenRouter" }));
    const dialog = screen.getByRole("dialog", { name: "Edit OpenRouter" });
    await userEvent.clear(within(dialog).getByLabelText("Default model"));
    await userEvent.type(
      within(dialog).getByLabelText("Default model"),
      "openai/gpt-4.1-mini",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(storeState.updateProvider).toHaveBeenCalledWith("openrouter", {
        defaultModel: "openai/gpt-4.1-mini",
        priority: 20,
        costTier: "MEDIUM",
      }),
    );
  });

  it("creates a provider using an environment variable reference, never a secret value", async () => {
    setup();
    renderPage();
    await screen.findByRole("navigation", { name: "Provider registry" });

    await userEvent.click(screen.getByRole("button", { name: "Add provider" }));
    const dialog = screen.getByRole("dialog", { name: "Add provider" });
    await userEvent.type(within(dialog).getByLabelText("Provider name"), "Lab Provider");
    await userEvent.type(within(dialog).getByLabelText("Base URL"), "https://lab.example/v1");
    await userEvent.type(within(dialog).getByLabelText("Default model"), "lab/model");
    await userEvent.type(
      within(dialog).getByLabelText("Credential environment variable"),
      "LAB_API_KEY",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Create provider" }));

    await waitFor(() =>
      expect(storeState.createProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Lab Provider",
          credentialEnvKey: "LAB_API_KEY",
        }),
      ),
    );
    expect(screen.queryByText(/sk-/)).not.toBeInTheDocument();
  });

  it("keeps registry evidence available when optional telemetry partially fails", async () => {
    setup({ telemetryError: true });
    renderPage();

    expect(
      await screen.findByRole("navigation", { name: "Provider registry" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Some provider telemetry could not be loaded.",
    );
    expect(
      screen.getByRole("heading", { name: "OpenRouter" }),
    ).toBeInTheDocument();
  });

  it("uses semantic Thai chrome while preserving provider-owned names and models", async () => {
    setup();
    renderPage("th");

    expect(
      await screen.findByRole("navigation", { name: "ทะเบียนผู้ให้บริการ" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ผู้ให้บริการ AI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ซิงก์โมเดล" })).toBeInTheDocument();
    expect(screen.getByText("openai/gpt-4o-mini")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "เปิดนโยบายการกำหนดเส้นทาง" })).toHaveAttribute(
      "href",
      "/routing",
    );
  });
});
