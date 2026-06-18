import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});

describe("AgentsPage fallback model validation", () => {
  it("auto-checks fallback models on load", async () => {
    setup();
    const deferred = createDeferred<{
      results: Array<{ modelId: string; status: "VALID"; checkedAt: string }>;
    }>();
    apiMocks.validateProviderModels.mockReturnValueOnce(deferred.promise);

    renderPage();

    await waitFor(() => {
      expect(apiMocks.validateProviderModels).toHaveBeenCalledWith("openrouter-free", ["openrouter/owl-alpha"]);
    });
    expect(await screen.findByText("Checking")).toBeInTheDocument();

    deferred.resolve({
      results: [{ modelId: "openrouter/owl-alpha", status: "VALID", checkedAt: nowIso }]
    });

    expect(await screen.findByText("Valid")).toBeInTheDocument();
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
    expect(await screen.findByText("Valid")).toBeInTheDocument();
    apiMocks.validateProviderModels.mockClear();

    const input = await screen.findByLabelText("Fallback model 1");
    fireEvent.change(input, { target: { value: "missing/model" } });

    await waitFor(
      () => {
        expect(apiMocks.validateProviderModels).toHaveBeenCalledTimes(1);
        expect(apiMocks.validateProviderModels).toHaveBeenCalledWith("openrouter-free", ["missing/model"]);
      },
      { timeout: 2500 }
    );

    expect(await screen.findByText("Invalid")).toBeInTheDocument();
    expect(screen.getByText("Model is not present.")).toBeInTheDocument();
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

    await waitFor(() => {
      expect(screen.getByText("Fallback chain:")).toBeInTheDocument();
    });

    const duplicateKeyWarning = consoleError.mock.calls.some((call) =>
      call.some((arg) => String(arg).includes("Encountered two children with the same key"))
    );
    expect(duplicateKeyWarning).toBe(false);
    consoleError.mockRestore();
  }, 10_000);
});
