import { Router } from "express";
import { getTreasuryByAgent, getTreasuryByModel, getTreasuryByMonth, getTreasuryByProvider, getTreasuryDailyReport, getTreasuryFallbackAnalytics, getTreasuryOverview, getTreasuryUsage, getPricingWarnings, getTreasuryProviderRegistry } from "../services/treasuryService.js";
import { checkBudgetStatus } from "../services/budgetGuardService.js";

const router = Router();

router.get("/overview", async (_req, res, next) => {
  try {
    const overview = await getTreasuryOverview();
    res.json(overview);
  } catch (error) {
    next(error);
  }
});

router.get("/usage", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const records = await getTreasuryUsage(Number.isFinite(limit) ? limit : 100);
    res.json({ records });
  } catch (error) {
    next(error);
  }
});

router.get("/agents", async (_req, res, next) => {
  try {
    const agents = await getTreasuryByAgent();
    res.json({ agents });
  } catch (error) {
    next(error);
  }
});

router.get("/providers", async (_req, res, next) => {
  try {
    const providers = await getTreasuryByProvider();
    res.json({ providers });
  } catch (error) {
    next(error);
  }
});

router.get("/provider-registry", async (_req, res, next) => {
  try {
    const registry = await getTreasuryProviderRegistry();
    res.json({ providers: registry });
  } catch (error) {
    next(error);
  }
});

router.get("/reports", async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days ?? 30), 365);
    const daily = await getTreasuryDailyReport(Number.isFinite(days) ? days : 30);
    res.json({ daily });
  } catch (error) {
    next(error);
  }
});

router.get("/pricing-warnings", async (_req, res, next) => {
  try {
    res.json(await getPricingWarnings());
  } catch (error) {
    next(error);
  }
});

router.get("/models", async (_req, res, next) => {
  try {
    const models = await getTreasuryByModel();
    res.json({ models });
  } catch (error) {
    next(error);
  }
});

router.get("/monthly", async (req, res, next) => {
  try {
    const months = Math.min(Number(req.query.months ?? 12), 36);
    const monthly = await getTreasuryByMonth(Number.isFinite(months) ? months : 12);
    res.json({ monthly });
  } catch (error) {
    next(error);
  }
});

router.get("/fallback-analytics", async (_req, res, next) => {
  try {
    const analytics = await getTreasuryFallbackAnalytics();
    res.json({ analytics });
  } catch (error) {
    next(error);
  }
});

router.get("/budget-status", async (_req, res, next) => {
  try {
    const status = await checkBudgetStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

export default router;
