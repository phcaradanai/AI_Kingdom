import assert from "node:assert/strict";
import test from "node:test";
import { createAIProviderByName } from "./providerFactory.js";

test("provider factory selects mock provider", () => {
  const provider = createAIProviderByName("mock");

  assert.equal(provider.name, "mock");
  assert.equal(provider.model, "deterministic-mock-v1");
});

test("provider factory selects OpenAI-compatible provider without requiring API key at construction", () => {
  const provider = createAIProviderByName("openai");

  assert.equal(provider.name, "openai");
});
