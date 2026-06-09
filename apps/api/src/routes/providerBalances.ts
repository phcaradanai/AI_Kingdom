import { Router } from "express";
import { auditLog } from "../services/auditService.js";
import {
  fetchDeepSeekBalanceSnapshot,
  listLatestProviderBalanceSnapshots,
  ProviderBalanceApiError,
  ProviderBalanceConfigError
} from "../services/providerBalanceService.js";
import {
  syncOpenRouterAccount,
  listLatestProviderAccountSnapshots,
  ProviderAccountConfigError,
  ProviderAccountApiError
} from "../services/providerAccountSyncService.js";
import {
  syncOpenRouterModels,
  getLatestProviderModelSnapshots,
  getLastModelSyncTime,
  ProviderModelSyncError
} from "../services/providerModelSyncService.js";
import {
  computeAndPersistHealthSnapshots,
  getLatestProviderHealthSnapshots
} from "../services/providerHealthSnapshotService.js";
import { getProviderIntelligenceSummary } from "../services/providerIntelligenceService.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const balances = await listLatestProviderBalanceSnapshots();
    res.json({ balances });
  } catch (error) {
    next(error);
  }
});

router.post("/deepseek/sync", async (req, res, next) => {
  try {
    const balances = await fetchDeepSeekBalanceSnapshot();
    await auditLog({
      userId: req.user?.id,
      action: "sync_provider_balance",
      resourceType: "provider_balance",
      resourceId: "deepseek",
      metadata: { providerType: "deepseek", currencies: balances.map((balance) => balance.currency) }
    });
    res.json({ balances });
  } catch (error) {
    if (error instanceof ProviderBalanceConfigError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof ProviderBalanceApiError) {
      res.status(error.statusCode).json({ error: "DeepSeek balance API request failed." });
      return;
    }
    next(error);
  }
});

// Provider account snapshots (OpenRouter credits, status)
router.get("/accounts", async (_req, res, next) => {
  try {
    const accounts = await listLatestProviderAccountSnapshots();
    res.json({ accounts });
  } catch (error) {
    next(error);
  }
});

router.post("/openrouter/account/sync", async (req, res, next) => {
  try {
    const account = await syncOpenRouterAccount();
    await auditLog({
      userId: req.user?.id,
      action: "sync_provider_account",
      resourceType: "provider_account",
      resourceId: "openrouter",
      metadata: { providerType: "openrouter", status: account.status }
    });
    res.json({ account });
  } catch (error) {
    if (error instanceof ProviderAccountConfigError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof ProviderAccountApiError) {
      res.status(error.statusCode).json({ error: "OpenRouter account API request failed." });
      return;
    }
    next(error);
  }
});

// Provider model snapshots
router.get("/models", async (req, res, next) => {
  try {
    const providerType = typeof req.query.providerType === "string" ? req.query.providerType : "openrouter";
    const models = await getLatestProviderModelSnapshots(providerType);
    const lastSyncedAt = await getLastModelSyncTime(providerType);
    res.json({ models, lastSyncedAt });
  } catch (error) {
    next(error);
  }
});

router.post("/openrouter/models/sync", async (req, res, next) => {
  try {
    const result = await syncOpenRouterModels();
    await auditLog({
      userId: req.user?.id,
      action: "sync_provider_models",
      resourceType: "provider_models",
      resourceId: "openrouter",
      metadata: { providerType: "openrouter", synced: result.synced }
    });
    res.json({ result });
  } catch (error) {
    if (error instanceof ProviderModelSyncError) {
      res.status(error.statusCode).json({ error: "OpenRouter models API request failed." });
      return;
    }
    next(error);
  }
});

// Provider health snapshots
router.get("/health", async (_req, res, next) => {
  try {
    const health = await getLatestProviderHealthSnapshots();
    res.json({ health });
  } catch (error) {
    next(error);
  }
});

router.post("/health/compute", async (req, res, next) => {
  try {
    const result = await computeAndPersistHealthSnapshots();
    await auditLog({
      userId: req.user?.id,
      action: "compute_provider_health",
      resourceType: "provider_health",
      resourceId: "all",
      metadata: { snapshotCount: result.snapshots.length }
    });
    res.json({ result });
  } catch (error) {
    next(error);
  }
});

// Provider intelligence summary (availability + health + last sync times)
router.get("/intelligence", async (_req, res, next) => {
  try {
    const intelligence = await getProviderIntelligenceSummary();
    res.json({ intelligence });
  } catch (error) {
    next(error);
  }
});

export default router;
