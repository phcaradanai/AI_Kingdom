import { Router } from "express";
import { auditLog } from "../services/auditService.js";
import {
  fetchDeepSeekBalanceSnapshot,
  listLatestProviderBalanceSnapshots,
  ProviderBalanceApiError,
  ProviderBalanceConfigError
} from "../services/providerBalanceService.js";

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

export default router;
