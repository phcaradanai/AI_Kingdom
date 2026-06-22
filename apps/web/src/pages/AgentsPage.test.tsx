import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentDto, AIProviderDto } from "@/types/api";
import { AgentsPage } from "./AgentsPage";

const nowIso = new Date().toISOString();

const apiMocks = vi.hoisted(() => ({
  getProviderModels: vi.fn(),
  validateProviderModels: vi.fn(),
  getAgentRoutingPreview: vi.fn(),
  getAgentEffectiveRequestPreview: vi.fn(),
  updateAgentDisplayProfile: vi.fn(),
  uploadAgentAvatar: vi.fn(),
  agents: vi.fn()
}));

const storeState = vi.hoisted(() => ({
  agents: [] as AgentDto[],
  providers: [] as AIProviderDto[],
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn()
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

vi.mock("@/stores/kingdomStore", () => ({
  useKingdomStore: (selector: (state: typeof storeState) => unknown) => selector(storeState)
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const provider: AIProviderDto = {
  id: "openrouter-free",
  name: "OpenRouter Free Sandbox",
  type: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  defaultModel: "openrouter/owl-alpha",
  isActive: true,
  priority: 5,
  supportsChat: true,
  supportsTools: true,
  supportsVision: true,
  supportsJsonMode: true,
  costTier: "FREE",
  capabilities: { supportsChat: true, supportsTools: true, supportsVision: true, supportsJsonMode: true },
  hasCredentials: true,
  environmentMode: "SANDBOX",
  isFreeTier: true,
  modelValidationStatus: "NOT_CHECKED",
  lastValidationTime: null,
  config: { openRouterModels: ["openrouter/owl-alpha", "openai/gpt-4o-mini"] },
  createdAt: nowIso,
  updatedAt: nowIso
};

const agent: AgentDto = {
  id: "agent-1",
  slug: "royal-tester",
  name: "royal-tester",
  title: "Royal Tester",
  role: "Testing",
  specialty: "Provider validation",
  description: "Tests provider fallback validation.",
  prompt: "Test prompt",
  systemPrompt: "Test prompt",
  skills: [],
  responseStyle: "concise",
  isActive: true,
  priority: 100,
  preferredProviderId: "openrouter-free",
  defaultModel: "openrouter/owl-alpha",
  fallbackProviderIds: [],
  fallbackModels: ["openrouter/owl-alpha"],
  routingPolicy: "FIXED_PRIMARY_WITH_FALLBACK",
  costPreference: null,
  temperature: null,
  maxTokens: null,
  personalDetail: "",
  personality: "",
  relationshipWithKing: "",
  relationshipWithCouncil: "",
  roleBoundaries: "",
  allowedActions: [],
  forbiddenActions: [],
  approvalRequiredFor: [],
  canProposeMemoryCandidates: true,
  canAutoSaveTrustedMemory: false,
  memoryRequiresApproval: true,
  allowedMemoryCategories: [],
  retentionPolicy: "approved durable memories only",
  parameterMode: "ROLE_DEFAULT",
  modelParameters: null,
  displayName: null,
  displayTitle: null,
  avatarUrl: null,
  avatarPrompt: null,
  avatarStyle: null,
  avatarVersion: 1,
  avatarUpdatedAt: null,
  canonicalName: null,
  canonicalTitle: null,
  coreSlug: null,
  createdAt: nowIso,
  updatedAt: nowIso
};

function setup() {
  storeState.agents = [agent];
  storeState.providers = [provider];
  storeState.createAgent.mockReset();
  storeState.updateAgent.mockReset();
  storeState.deleteAgent.mockReset();
  apiMocks.getProviderModels.mockResolvedValue({
    models: ["openrouter/owl-alpha", "openai/gpt-4o-mini"],
    count: 2,
    lastSyncedAt: nowIso,
    fromCache: true,
    validationStatus: "VALID"
  });
  apiMocks.getAgentRoutingPreview.mockResolvedValue({
    effectiveRoute: null,
    fallbackProviderDetails: [],
    latestUsage: null
  });
  apiMocks.getAgentEffectiveRequestPreview.mockResolvedValue({
    parameterMode: "ROLE_DEFAULT",
    preview: {
      configuredProvider: "openrouter-free",
      configuredModel: "openrouter/owl-alpha",
      actualSentModel: "openrouter/owl-alpha",
      finalResponseModel: null,
      streamEnabled: false,
      reasoningEnabled: true,
      reasoningEffort: "medium",
      reasoningExcluded: true,
      response_format: "none",
      validationState: {},
      actualSentBodyPreview: {}
    }
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AgentsPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

async function openFallbackEditor() {
  await userEvent.click(await screen.findByRole("button", { name: "Edit configuration" }));
  const dialog = await screen.findByRole("dialog", { name: "Edit Royal Tester" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Fallbacks" }));
  return dialog;
}

describe("AgentsPage fallback model validation", () => {
  it("auto-checks fallback models on load", async () => {
    setup();
    const deferred = createDeferred<{
      results: Array<{ modelId: string; status: "VALID"; checkedAt: string }>;
    }>();
    apiMocks.validateProviderModels.mockReturnValueOnce(deferred.promise);

    renderPage();
    const dialog = await openFallbackEditor();

    await waitFor(() => {
      expect(apiMocks.validateProviderModels).toHaveBeenCalledWith("openrouter-free", ["openrouter/owl-alpha"]);
    });
    expect(await within(dialog).findByText("Checking")).toBeInTheDocument();

    deferred.resolve({
      results: [{ modelId: "openrouter/owl-alpha", status: "VALID", checkedAt: nowIso }]
    });

    expect(await within(dialog).findByText("Valid")).toBeInTheDocument();
  }, 10_000);

  it("debounces validation after editing a fallback model", async () => {
    setup();
    apiMocks.validateProviderModels
      .mockResolvedValueOnce({
        results: [{ modelId: "openrouter/owl-alpha", status: "VALID", checkedAt: nowIso }]
      })
      .mockResolvedValueOnce({
        results: [{ modelId: "missing/model", status: "INVALID", reason: "Model is not present.", checkedAt: nowIso }]
      });

    renderPage();
    const dialog = await openFallbackEditor();
    expect(await within(dialog).findByText("Valid")).toBeInTheDocument();
    apiMocks.validateProviderModels.mockClear();

    const input = await within(dialog).findByLabelText("Fallback model 1");
    fireEvent.change(input, { target: { value: "missing/model" } });

    await waitFor(
      () => {
        expect(apiMocks.validateProviderModels).toHaveBeenCalledTimes(1);
        expect(apiMocks.validateProviderModels).toHaveBeenCalledWith("openrouter-free", ["missing/model"]);
      },
      { timeout: 2500 }
    );

    expect(await within(dialog).findByText("Invalid")).toBeInTheDocument();
    expect(within(dialog).getByText("Model is not present.")).toBeInTheDocument();
  }, 10_000);

  it("renders repeated OpenRouter fallback attempts without duplicate-key warnings", async () => {
    setup();
    apiMocks.validateProviderModels.mockResolvedValue({
      results: [{ modelId: "openrouter/owl-alpha", status: "VALID", checkedAt: nowIso }]
    });
    apiMocks.getAgentRoutingPreview.mockResolvedValueOnce({
      effectiveRoute: {
        provider: {
          id: "openrouter-free",
          name: "OpenRouter Free Sandbox",
          type: "openrouter",
          environmentMode: "SANDBOX",
          hasCredentials: true,
          costTier: "FREE",
          defaultModel: "openrouter/owl-alpha"
        },
        model: "openrouter/owl-alpha",
        fallbackProviders: [
          {
            id: "openrouter-free",
            name: "OpenRouter Free Sandbox",
            type: "openrouter",
            environmentMode: "SANDBOX",
            hasCredentials: true,
            costTier: "FREE",
            defaultModel: "openai/gpt-4o-mini"
          },
          {
            id: "openrouter-free",
            name: "OpenRouter Free Sandbox",
            type: "openrouter",
            environmentMode: "SANDBOX",
            hasCredentials: true,
            costTier: "FREE",
            defaultModel: "openrouter/cypher-alpha"
          }
        ]
      },
      attemptPlan: [],
      fallbackProviderDetails: [],
      blockedFallbackProviderDetails: [],
      sandboxFallbackMode: false,
      latestUsage: null
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Routing" }));

    await waitFor(() => {
      expect(screen.getAllByText("Fallback chain:").length).toBeGreaterThan(0);
    });

    const duplicateKeyWarning = consoleError.mock.calls.some((call) =>
      call.some((arg) => String(arg).includes("Encountered two children with the same key"))
    );
    expect(duplicateKeyWarning).toBe(false);
    consoleError.mockRestore();
  }, 10_000);
});

describe("AgentsPage registry workspace", () => {
  it("keeps creation explicit and exposes focused source-owned sections", async () => {
    setup();
    apiMocks.validateProviderModels.mockResolvedValue({ results: [{ modelId: "openrouter/owl-alpha", status: "VALID", checkedAt: nowIso }] });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Royal agent command registry" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Living Agent profile" })).toHaveAttribute("href", "/living-agents/agent-1");
    expect(screen.getByRole("link", { name: "Provider registry" })).toHaveAttribute("href", "/providers");
    expect(screen.getByRole("navigation", { name: "Agent configuration sections" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    const dialog = await screen.findByRole("dialog", { name: "Create royal agent" });
    expect(within(dialog).getByRole("button", { name: "Identity" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Prompt" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Skills" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Routing" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Fallbacks" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("renders saved display identity while retaining canonical identity evidence", async () => {
    setup();
    storeState.agents = [{ ...agent, displayName: "Astra", displayTitle: "Royal Quality Marshal", canonicalName: "royal-tester", canonicalTitle: "Royal Tester" }];
    apiMocks.validateProviderModels.mockResolvedValue({ results: [{ modelId: "openrouter/owl-alpha", status: "VALID", checkedAt: nowIso }] });
    renderPage();

    expect((await screen.findAllByRole("heading", { name: "Royal Quality Marshal" })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Astra").length).toBeGreaterThan(0);
    expect(screen.getAllByText("royal-tester").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Royal Tester").length).toBeGreaterThan(0);
  });

  it("uses semantic Thai chrome without translating source data", async () => {
    localStorage.setItem("ai-kingdom-ui-language", "th");
    setup();
    apiMocks.validateProviderModels.mockResolvedValue({ results: [{ modelId: "openrouter/owl-alpha", status: "VALID", checkedAt: nowIso }] });
    renderPage();

    expect(await screen.findByRole("heading", { name: "ศูนย์ควบคุมเอเจนต์หลวง" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "สร้างเอเจนต์" })).toBeInTheDocument();
    expect(screen.getAllByText("Royal Tester").length).toBeGreaterThan(0);
  });
});
