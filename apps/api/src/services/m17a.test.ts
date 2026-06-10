import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/prisma.js";
import { createRouteChain, duplicateRouteChain } from "./routeChainService.js";
import { calculateCostUSDFromRegistry } from "./modelPricingService.js";
import { classifyHealthFromRate } from "./providerHealthSnapshotService.js";

// ─── Phase 1: Route Chain Duplicate ───────────────────────────────────────────

describe("Route chain duplicate", () => {
  let chainId: string;

  before(async () => {
    const chain = await createRouteChain({
      name: "Test chain for dup",
      scope: "GLOBAL",
      isActive: false,
      entries: [
        { providerId: "openrouter", model: "openai/gpt-4o-mini", isEnabled: true },
        { providerId: "local-sandbox-baseline", model: "local-sandbox-baseline", isEnabled: true }
      ]
    });
    chainId = chain.id;
  });

  after(async () => {
    await prisma.aIRouteChain.deleteMany({ where: { name: { startsWith: "Test chain for dup" } } });
  });

  it("creates a copy with (copy) suffix and isActive=false", async () => {
    const copy = await duplicateRouteChain(chainId);
    assert.equal(copy.name, "Test chain for dup (copy)");
    assert.equal(copy.isActive, false);
  });

  it("preserves all entries in the duplicate", async () => {
    const original = await prisma.aIRouteChain.findUniqueOrThrow({ where: { id: chainId }, include: { entries: true } });
    const copy = await duplicateRouteChain(chainId);
    assert.equal(copy.entries.length, original.entries.length);
    assert.equal(copy.entries[0]!.providerId, original.entries[0]!.providerId);
  });

  it("sandbox terminator is still last entry in duplicate", async () => {
    const copy = await duplicateRouteChain(chainId);
    const last = copy.entries[copy.entries.length - 1]!;
    assert.equal(last.providerId, "local-sandbox-baseline");
  });
});

// ─── Phase 3: costConfidence ──────────────────────────────────────────────────

describe("costConfidence classification", () => {
  it("returns 1.0 confidence for FREE providers", async () => {
    const result = await calculateCostUSDFromRegistry("sandbox", "local-sandbox-baseline", { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    assert.equal(result.costSource, "FREE");
    assert.equal(result.costConfidence, 1.0);
  });

  it("returns 0.0 confidence for UNKNOWN pricing", async () => {
    const result = await calculateCostUSDFromRegistry("unknown-provider-xyz", "unknown-model-xyz", { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    assert.equal(result.costSource, "ESTIMATED");
    assert.equal(result.costConfidence, 0.0);
  });

  it("returns high confidence for known pricing (static table)", async () => {
    const result = await calculateCostUSDFromRegistry("mock", "deterministic-mock-v1", { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    assert.equal(result.costSource, "FREE");
    assert.equal(result.costConfidence, 1.0);
  });
});

// ─── Phase 5: Health threshold ────────────────────────────────────────────────

describe("Health threshold classification", () => {
  it("classifies 5% failure rate as HEALTHY", () => {
    const status = classifyHealthFromRate(0.05, 10);
    assert.equal(status, "HEALTHY");
  });

  it("classifies 15% failure rate as DEGRADED", () => {
    const status = classifyHealthFromRate(0.15, 10);
    assert.equal(status, "DEGRADED");
  });

  it("classifies 35% failure rate as DOWN (new threshold 30%, not 50%)", () => {
    const status = classifyHealthFromRate(0.35, 10);
    assert.equal(status, "DOWN");
  });

  it("classifies 49% failure rate as DOWN (was DEGRADED at old 50% threshold)", () => {
    const status = classifyHealthFromRate(0.49, 10);
    assert.equal(status, "DOWN");
  });

  it("returns UNKNOWN for small sample size", () => {
    const status = classifyHealthFromRate(0.5, 2);
    assert.equal(status, "UNKNOWN");
  });
});

// ─── Phase 4: Reconciliation ──────────────────────────────────────────────────

describe("Provider reconciliation", () => {
  it("can create and retrieve a reconciliation snapshot", async () => {
    const snap = await prisma.providerReconciliationSnapshot.create({
      data: {
        providerType: "openrouter",
        periodLabel: "test",
        estimatedSpendUSD: 0.05,
        providerReportedSpendUSD: 0.052,
        varianceAmount: 0.002,
        variancePercent: 3.8,
        confidenceScore: 0.92,
        recordCount: 10,
        knownPricingCount: 9
      }
    });
    assert.ok(snap.id);
    assert.equal(snap.providerType, "openrouter");
    assert.equal(snap.recordCount, 10);
    await prisma.providerReconciliationSnapshot.delete({ where: { id: snap.id } });
  });
});
