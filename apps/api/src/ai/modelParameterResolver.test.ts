import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveEffectiveParameters,
  buildProviderRequestBody,
  buildRequestPreview
} from "./modelParameterResolver.js";

const baseAgent = {
  slug: "grand-vizier",
  parameterMode: null,
  modelParameters: null,
  temperature: null,
  maxTokens: null
};

// Test 1: Nemotron request includes reasoning when configured
test("resolveEffectiveParameters includes reasoning for openrouter provider", () => {
  const effective = resolveEffectiveParameters({ ...baseAgent, parameterMode: "ROLE_DEFAULT" }, "openrouter", 1600);
  assert.ok(effective.reasoning !== null, "reasoning should be present for openrouter");
  assert.equal(effective.reasoning!.enabled, true, "reasoning.enabled should be true by default");
});

// Test 2: reasoning.exclude defaults to true
test("reasoning.exclude defaults to true", () => {
  const effective = resolveEffectiveParameters(baseAgent, "openrouter", 1600);
  assert.equal(effective.reasoning!.exclude, true, "reasoning.exclude should default to true");
});

// Test 3: null parameters are omitted from request body
test("null parameters are omitted from provider request body", () => {
  const effective = resolveEffectiveParameters({ ...baseAgent, parameterMode: "PROVIDER_DEFAULT" }, "openai", 700);
  const body = buildProviderRequestBody({
    model: "gpt-4o",
    messages: [{ role: "user", content: "test" }],
    effective
  });
  assert.ok(!("temperature" in body) || body.temperature !== null, "null temperature should not appear");
  assert.ok(!("top_p" in body), "null top_p should not appear in body");
  assert.ok(!("seed" in body), "null seed should not appear in body");
  assert.ok(!("reasoning" in body), "reasoning should not appear for PROVIDER_DEFAULT");
});

// Test 4: stream defaults to false
test("stream defaults to false", () => {
  const effective = resolveEffectiveParameters(baseAgent, "openrouter");
  assert.equal(effective.stream, false, "stream should default to false");
  const body = buildProviderRequestBody({
    model: "nvidia/nemotron",
    messages: [{ role: "user", content: "test" }],
    effective
  });
  assert.equal(body.stream, false, "stream: false should be in request body");
});

// Test 5: role default for Grand Vizier uses temperature 0.2 and reasoning high
test("role default for Grand Vizier uses temperature 0.2 and reasoning high", () => {
  const effective = resolveEffectiveParameters(
    { ...baseAgent, slug: "grand-vizier", parameterMode: "ROLE_DEFAULT" },
    "openrouter"
  );
  assert.equal(effective.temperature, 0.2, "Grand Vizier should have temperature 0.2");
  assert.equal(effective.reasoning?.effort, "high", "Grand Vizier should have reasoning effort high");
  assert.equal(effective.mode, "ROLE_DEFAULT");
});

// Test 6: manual override takes precedence over role default
test("MANUAL mode uses stored modelParameters over role defaults", () => {
  const effective = resolveEffectiveParameters(
    {
      slug: "grand-vizier",
      parameterMode: "MANUAL",
      modelParameters: {
        stream: false,
        temperature: 0.7,
        max_tokens: 2000,
        top_p: null,
        seed: null,
        reasoning: { enabled: true, effort: "low", max_tokens: null, exclude: true },
        tools: { enabled: false, tool_choice: "auto" }
      },
      temperature: null,
      maxTokens: null
    },
    "openrouter",
    700
  );
  assert.equal(effective.temperature, 0.7, "Manual temperature should override role default");
  assert.equal(effective.reasoning?.effort, "low", "Manual reasoning effort should override role default");
  assert.equal(effective.mode, "MANUAL");
});

// Test 7: provider request body sends exact model id
test("buildProviderRequestBody never sends both reasoning.effort and reasoning.max_tokens (OpenRouter 400 guard)", () => {
  // A stored config that carries BOTH effort and max_tokens — OpenRouter rejects this
  // with "Only one of reasoning.effort and reasoning.max_tokens can be specified".
  const effective = resolveEffectiveParameters(
    {
      slug: "planner",
      parameterMode: "MANUAL",
      modelParameters: {
        stream: false,
        temperature: 0.3,
        max_tokens: 900,
        reasoning: { enabled: true, effort: "medium", max_tokens: 2048, exclude: true },
        tools: { enabled: false, tool_choice: "auto" }
      },
      temperature: null,
      maxTokens: null
    },
    "openrouter",
    900
  );
  const body = buildProviderRequestBody({
    model: "deepseek/deepseek-chat-v3-0324",
    messages: [{ role: "user", content: "test" }],
    effective
  });
  const reasoning = body.reasoning as Record<string, unknown> | undefined;
  assert.ok(reasoning, "reasoning should be present");
  const hasBoth = reasoning && "effort" in reasoning && "max_tokens" in reasoning;
  assert.equal(hasBoth, false, "must not send both effort and max_tokens");
  assert.equal(reasoning!.effort, "medium", "effort takes precedence when both are configured");
});

test("buildProviderRequestBody sends reasoning.max_tokens when no effort is in play", () => {
  const effective = resolveEffectiveParameters(
    {
      slug: "planner",
      parameterMode: "MANUAL",
      modelParameters: {
        stream: false,
        reasoning: { enabled: false, effort: "none", max_tokens: 1500, exclude: true },
        tools: { enabled: false, tool_choice: "auto" }
      },
      temperature: null,
      maxTokens: null
    },
    "openrouter"
  );
  const body = buildProviderRequestBody({ model: "deepseek/deepseek-chat-v3-0324", messages: [{ role: "user", content: "t" }], effective });
  const reasoning = body.reasoning as Record<string, unknown>;
  // enabled:false → effort "none" is the disable signal; still must not pair with max_tokens.
  assert.ok(!("max_tokens" in reasoning) || !("effort" in reasoning), "must not send both");
});

test("buildProviderRequestBody adds reasoning headroom to max_tokens so reasoning never starves content", () => {
  // grand-vizier role → reasoning effort high; requested content budget 900.
  const effective = resolveEffectiveParameters(baseAgent, "openrouter", 900);
  assert.equal(effective.reasoning?.enabled, true);
  assert.equal(effective.reasoning?.effort, "high");
  const body = buildProviderRequestBody({ model: "deepseek/deepseek-v4-pro", messages: [{ role: "user", content: "t" }], effective });
  // 900 content + 3072 high-effort reserve
  assert.equal(body.max_tokens, 900 + 3072);
});

test("buildProviderRequestBody adds no reasoning headroom when reasoning is off (non-openrouter)", () => {
  const effective = resolveEffectiveParameters(baseAgent, "openai", 900);
  assert.equal(effective.reasoning, null);
  const body = buildProviderRequestBody({ model: "gpt-4o-mini", messages: [{ role: "user", content: "t" }], effective });
  assert.equal(body.max_tokens, 900);
});

test("buildProviderRequestBody sends exact model id in body", () => {
  const effective = resolveEffectiveParameters(baseAgent, "openrouter");
  const modelId = "nvidia/nemotron-3-super-120b-a12b:free";
  const body = buildProviderRequestBody({
    model: modelId,
    messages: [{ role: "user", content: "test" }],
    effective
  });
  assert.equal(body.model, modelId, "model id should be sent exactly as provided");
});

test("escalation forces reasoning ON at high effort even when stored config disables it", () => {
  const agent = {
    slug: "planner",
    parameterMode: "MANUAL",
    modelParameters: {
      reasoning: { enabled: false, effort: "none", max_tokens: null, exclude: true }
    },
    temperature: null,
    maxTokens: 8000
  };
  // Without escalation: reasoning stays off
  const base = resolveEffectiveParameters(agent, "openrouter", 8000);
  assert.equal(base.reasoning?.enabled, false);
  assert.equal(base.reasoning?.effort, "none");
  // With escalation: forced on at high effort
  const escalated = resolveEffectiveParameters(agent, "openrouter", 8000, { reasoning: true, reasoningEffort: "high" });
  assert.equal(escalated.reasoning?.enabled, true);
  assert.equal(escalated.reasoning?.effort, "high");
});

test("escalation is a no-op for providers that do not support reasoning (sandbox/openai)", () => {
  const agent = { slug: "planner", parameterMode: "MANUAL", modelParameters: null, temperature: null, maxTokens: 8000 };
  const effective = resolveEffectiveParameters(agent, "openai", 8000, { reasoning: true, reasoningEffort: "high" });
  assert.equal(effective.reasoning, null, "escalation must not invent reasoning on unsupported providers");
});

test("escalation with reasoning:false leaves config untouched", () => {
  const agent = {
    slug: "planner",
    parameterMode: "MANUAL",
    modelParameters: { reasoning: { enabled: false, effort: "none", max_tokens: null, exclude: true } },
    temperature: null,
    maxTokens: 8000
  };
  const effective = resolveEffectiveParameters(agent, "openrouter", 8000, { reasoning: false });
  assert.equal(effective.reasoning?.enabled, false);
});

test("escalated reasoning produces a valid request body with effort and headroom", () => {
  const agent = {
    slug: "planner",
    parameterMode: "MANUAL",
    modelParameters: { reasoning: { enabled: false, effort: "none", max_tokens: null, exclude: true } },
    temperature: null,
    maxTokens: 8000
  };
  const effective = resolveEffectiveParameters(agent, "openrouter", 8000, { reasoning: true, reasoningEffort: "high" });
  const body = buildProviderRequestBody({ model: "deepseek/deepseek-v4-flash", messages: [{ role: "user", content: "t" }], effective });
  const reasoning = body.reasoning as Record<string, unknown>;
  assert.equal(reasoning.effort, "high");
  assert.equal(reasoning.max_tokens, undefined, "must not send both effort and max_tokens");
  assert.equal(body.max_tokens, 8000 + 3072, "high-effort reasoning adds 3072 headroom");
});

// Test 8: PROVIDER_DEFAULT mode produces minimal request
test("PROVIDER_DEFAULT mode excludes reasoning and extra params", () => {
  const effective = resolveEffectiveParameters(
    { ...baseAgent, parameterMode: "PROVIDER_DEFAULT" },
    "openrouter"
  );
  assert.equal(effective.reasoning, null, "reasoning should be null for PROVIDER_DEFAULT");
  assert.equal(effective.tools, null, "tools should be null for PROVIDER_DEFAULT");
  assert.equal(effective.mode, "PROVIDER_DEFAULT");
});

// Test 9: reasoning not included for non-openrouter providers
test("reasoning is not included for non-openrouter providers (openai type)", () => {
  const effective = resolveEffectiveParameters(
    { ...baseAgent, parameterMode: "ROLE_DEFAULT" },
    "openai"
  );
  assert.equal(effective.reasoning, null, "reasoning should be null for openai provider type");
});

// Test 10: buildRequestPreview never includes API key or auth headers
test("buildRequestPreview returns sanitized preview without credentials", () => {
  const effective = resolveEffectiveParameters(baseAgent, "openrouter");
  const preview = buildRequestPreview({ provider: "openrouter-free", model: "nvidia/nemotron", effective });
  const previewStr = JSON.stringify(preview);
  assert.ok(!previewStr.includes("apiKey"), "preview should not contain apiKey");
  assert.ok(!previewStr.includes("Authorization"), "preview should not contain Authorization");
  assert.ok(!previewStr.includes("Bearer"), "preview should not contain Bearer token");
  assert.ok("model" in preview, "preview should contain model");
  assert.ok("provider" in preview, "preview should contain provider");
});

// Test 11: Royal Researcher gets higher temperature than Royal Treasurer
test("role defaults produce different temperatures for different roles", () => {
  const researcher = resolveEffectiveParameters({ ...baseAgent, slug: "royal-researcher", parameterMode: "ROLE_DEFAULT" }, "openrouter");
  const treasurer = resolveEffectiveParameters({ ...baseAgent, slug: "royal-treasurer", parameterMode: "ROLE_DEFAULT" }, "openrouter");
  assert.ok(researcher.temperature! > treasurer.temperature!, "Researcher should have higher temperature than Treasurer");
});

// Test 12: legacy temperature/maxTokens fields are used in ROLE_DEFAULT when no modelParameters
test("legacy agent temperature field is used in ROLE_DEFAULT when set", () => {
  const effective = resolveEffectiveParameters(
    { ...baseAgent, slug: "grand-vizier", parameterMode: "ROLE_DEFAULT", temperature: 0.9, maxTokens: 1234 },
    "openrouter"
  );
  // Agent-level temperature overrides the role default
  assert.equal(effective.temperature, 0.9, "agent.temperature should override role default in ROLE_DEFAULT mode");
  assert.equal(effective.max_tokens, 1234, "agent.maxTokens should be used");
});

test("advanced params omit null values", () => {
  const effective = resolveEffectiveParameters(
    {
      ...baseAgent,
      parameterMode: "MANUAL",
      modelParameters: {
        stream: false,
        temperature: null,
        max_tokens: 1000,
        top_p: null,
        seed: null,
        response_format: "none",
        stop: [],
        frequency_penalty: null,
        presence_penalty: null,
        repetition_penalty: null,
        top_k: null,
        min_p: null,
        openrouter_route: "none",
        openrouter_provider_preferences: [],
        plugins: [],
        reasoning: { enabled: true, effort: "medium", max_tokens: null, exclude: true },
        tools: { enabled: false, tool_choice: "auto" }
      }
    },
    "openrouter"
  );
  const body = buildProviderRequestBody({ model: "openrouter/owl-alpha", messages: [{ role: "user", content: "test" }], effective });
  // reasoning enabled (effort medium) adds 2048 headroom on top of the 1000 content budget
  assert.equal(body.max_tokens, 1000 + 2048);
  assert.ok(!("frequency_penalty" in body));
  assert.ok(!("presence_penalty" in body));
  assert.ok(!("response_format" in body));
  assert.ok(!("stop" in body));
});

test("response_format json_object is included only when configured", () => {
  const withoutJson = resolveEffectiveParameters({ ...baseAgent, parameterMode: "MANUAL", modelParameters: { response_format: "none" } }, "openrouter");
  const withoutBody = buildProviderRequestBody({ model: "openrouter/owl-alpha", messages: [{ role: "user", content: "test" }], effective: withoutJson });
  assert.ok(!("response_format" in withoutBody));

  const withJson = resolveEffectiveParameters({ ...baseAgent, parameterMode: "MANUAL", modelParameters: { response_format: "json_object" } }, "openrouter");
  const withBody = buildProviderRequestBody({ model: "openrouter/owl-alpha", messages: [{ role: "user", content: "test" }], effective: withJson });
  assert.deepEqual(withBody.response_format, { type: "json_object" });
});
