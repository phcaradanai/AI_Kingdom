import assert from "node:assert/strict";
import test from "node:test";
import { cosineSimilarity, mockEmbedding } from "./embeddingService.js";

// ─── cosineSimilarity ────────────────────────────────────────────────────────

test("cosineSimilarity: identical vectors → 1.0", () => {
  const v = [0.6, 0.8, 0.0];
  assert.ok(Math.abs(cosineSimilarity(v, v) - 1.0) < 1e-9);
});

test("cosineSimilarity: orthogonal vectors → 0", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("cosineSimilarity: opposite vectors → -1", () => {
  assert.ok(Math.abs(cosineSimilarity([0.6, 0.8], [-0.6, -0.8]) - (-1)) < 1e-9);
});

test("cosineSimilarity: different lengths → 0 (safe fallback)", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0, 0]), 0);
});

test("cosineSimilarity: zero vector → 0", () => {
  assert.equal(cosineSimilarity([0, 0, 0], [1, 0, 0]), 0);
});

// ─── mockEmbedding ───────────────────────────────────────────────────────────

test("mockEmbedding: returns a 128-element unit vector", () => {
  const v = mockEmbedding("authentication JWT token failure");
  assert.equal(v.length, 128);
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(mag - 1.0) < 1e-9 || mag === 0, `magnitude was ${mag}`);
});

test("mockEmbedding: deterministic — same text always same vector", () => {
  const a = mockEmbedding("database performance slow queries");
  const b = mockEmbedding("database performance slow queries");
  assert.deepEqual(a, b);
});

test("mockEmbedding: empty/whitespace-only text returns zero vector safely", () => {
  const v = mockEmbedding("   ");
  assert.equal(v.length, 128);
  const allZero = v.every((x) => x === 0);
  assert.ok(allZero, "empty text should produce the zero vector");
});

test("mockEmbedding: shared-vocabulary texts are more similar than unrelated texts", () => {
  const authA = mockEmbedding("authentication JWT token failure");
  const authB = mockEmbedding("JWT authentication error token");
  const unrelated = mockEmbedding("database performance slow query");

  const simRelated = cosineSimilarity(authA, authB);
  const simUnrelated = cosineSimilarity(authA, unrelated);
  assert.ok(
    simRelated > simUnrelated,
    `related similarity (${simRelated.toFixed(3)}) should be > unrelated (${simUnrelated.toFixed(3)})`
  );
});

test("mockEmbedding: completely different texts have low similarity", () => {
  const a = mockEmbedding("authentication token security login");
  const b = mockEmbedding("treasury budget cost monthly report");
  const sim = cosineSimilarity(a, b);
  assert.ok(sim < 0.5, `expected low similarity, got ${sim.toFixed(3)}`);
});

test("mockEmbedding: handles thai text without throwing", () => {
  const v = mockEmbedding("ระบบฐานข้อมูล authentication");
  assert.equal(v.length, 128);
});
