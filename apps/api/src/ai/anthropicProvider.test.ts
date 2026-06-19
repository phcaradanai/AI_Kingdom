import assert from "node:assert/strict";
import test from "node:test";
import { AnthropicProvider } from "./anthropicProvider.js";
import { createAIProviderByName } from "./providerFactory.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import type { GenerateAgentResponseInput } from "./aiProvider.js";

const baseInput: GenerateAgentResponseInput = {
  command: "Assess the dispatch flow.",
  mode: "BUILD",
  agentName: "Claude Code",
  agentRole: "Royal Senior Engineer",
  agentSkills: ["architecture"],
  systemPrompt: "You are an execution agent.",
  responseStyle: "concise",
  maxTokens: 256,
  temperature: 0.2
};

function fakeFetch(captured: { url?: string; init?: RequestInit }, body: unknown, ok = true, status = 200): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body)
    };
  }) as unknown as typeof fetch;
}

test("AnthropicProvider posts to /messages with x-api-key + anthropic-version and parses content/usage", async () => {
  const captured: { url?: string; init?: RequestInit } = {};
  const provider = new AnthropicProvider({
    apiKey: "sk-ant-test",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-sonnet-latest",
    anthropicVersion: "2023-06-01",
    timeoutMs: 5000,
    fetchImpl: fakeFetch(captured, {
      model: "claude-3-5-sonnet-latest",
      content: [{ type: "text", text: "Assessment: looks good." }],
      usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 20 }
    })
  });

  const result = await provider.generateAgentResponse(baseInput);

  assert.equal(captured.url, "https://api.anthropic.com/v1/messages");
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "sk-ant-test");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  const sentBody = JSON.parse(captured.init?.body as string);
  assert.equal(sentBody.model, "claude-3-5-sonnet-latest");
  assert.equal(typeof sentBody.system, "string");
  assert.equal(sentBody.messages[0].role, "user");

  assert.match(result.response, /Assessment: looks good\./);
  assert.equal(result.usage.promptTokens, 120);
  assert.equal(result.usage.completionTokens, 40);
  assert.equal(result.usage.totalTokens, 160);
  assert.equal(result.usage.inputCacheHitTokens, 20);
  assert.equal(result.usage.inputCacheMissTokens, 100);
  assert.equal(result.responseModel, "claude-3-5-sonnet-latest");
});

test("AnthropicProvider joins multiple text blocks and ignores non-text blocks", async () => {
  const captured: { url?: string; init?: RequestInit } = {};
  const provider = new AnthropicProvider({
    apiKey: "sk-ant-test",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-sonnet-latest",
    timeoutMs: 5000,
    fetchImpl: fakeFetch(captured, {
      content: [
        { type: "text", text: "Part one." },
        { type: "tool_use", text: "should be ignored" },
        { type: "text", text: "Part two." }
      ],
      usage: { input_tokens: 5, output_tokens: 3 }
    })
  });

  const result = await provider.generateAgentResponse(baseInput);
  assert.equal(result.response, "Part one.\nPart two.");
});

test("AnthropicProvider surfaces a provider error with status code on non-ok responses", async () => {
  const captured: { url?: string; init?: RequestInit } = {};
  const provider = new AnthropicProvider({
    apiKey: "sk-ant-test",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-sonnet-latest",
    timeoutMs: 5000,
    fetchImpl: fakeFetch(captured, { error: { message: "overloaded" } }, false, 529)
  });

  await assert.rejects(() => provider.generateAgentResponse(baseInput), (err: any) => {
    assert.equal(err.statusCode, 529);
    assert.match(String(err.message), /provider error 529/);
    return true;
  });
});

test("AnthropicProvider throws a clear error when the API key is missing", async () => {
  const provider = new AnthropicProvider({ apiKey: "", baseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-3-5-sonnet-latest", timeoutMs: 5000 });
  await assert.rejects(() => provider.generateAgentResponse(baseInput), /API key is required/);
});

test("factory: gemini resolves to an OpenAI-compatible client; anthropic resolves to AnthropicProvider", () => {
  const gemini = createAIProviderByName("gemini");
  assert.ok(gemini instanceof OpenAICompatibleProvider);
  assert.equal(gemini.name, "gemini");

  const anthropic = createAIProviderByName("anthropic");
  assert.ok(anthropic instanceof AnthropicProvider);
  assert.equal(anthropic.name, "anthropic");
});
