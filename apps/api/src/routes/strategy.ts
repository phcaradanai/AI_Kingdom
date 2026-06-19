import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import {
  createAsset,
  createExperiment,
  createMetric,
  createObjective,
  createOpportunity,
  createOpportunityWorkOrder,
  createRevenueStream,
  getStrategyOverview,
  listAssets,
  listExperiments,
  listMetrics,
  listObjectives,
  listOpportunities,
  listRevenueStreams,
  updateAsset,
  updateExperiment,
  updateMetric,
  updateObjective,
  updateOpportunity,
  updateRevenueStream
} from "../services/strategyLedgerService.js";

const router = Router();

const idParams = z.object({ id: z.string().trim().min(1) });
const priority = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const objectiveStatus = z.enum(["ACTIVE", "PAUSED", "ACHIEVED", "ARCHIVED"]);
const metricDirection = z.enum(["INCREASE", "DECREASE", "MAINTAIN"]);
const metricStatus = z.enum(["UNKNOWN", "ON_TRACK", "AT_RISK", "OFF_TRACK", "ACHIEVED"]);
const assetType = z.enum(["PRODUCT", "TEMPLATE", "SERVICE", "KNOWLEDGE", "AUTOMATION", "CONTENT", "COMMUNITY", "OTHER"]);
const assetStatus = z.enum(["IDEA", "BUILDING", "ACTIVE", "MONETIZING", "PAUSED", "ARCHIVED"]);
const revenueModel = z.enum(["SUBSCRIPTION", "ONE_TIME", "SERVICE", "AFFILIATE", "ADS", "LICENSING", "OTHER"]);
const revenueStatus = z.enum(["PLANNED", "TESTING", "ACTIVE", "PAUSED", "ENDED"]);
const opportunityStatus = z.enum(["INBOX", "REVIEWING", "VALIDATING", "APPROVED", "REJECTED", "ARCHIVED"]);
const experimentStatus = z.enum(["PLANNED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]);

const nullableId = z.string().trim().min(1).max(120).optional().nullable();
const tags = z.array(z.string().trim().min(1).max(80)).max(30).default([]);

const objectiveSchema = z.object({
  projectId: nullableId,
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(4000).default(""),
  status: objectiveStatus.default("ACTIVE"),
  priority: priority.default("MEDIUM"),
  targetDate: z.coerce.date().optional().nullable(),
  sourceType: z.string().trim().max(80).optional().nullable(),
  sourceId: z.string().trim().max(160).optional().nullable(),
  tags
});

const metricSchema = z.object({
  objectiveId: nullableId,
  projectId: nullableId,
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).default(""),
  unit: z.string().trim().max(40).default(""),
  direction: metricDirection.default("INCREASE"),
  baselineValue: z.coerce.number().optional().nullable(),
  currentValue: z.coerce.number().default(0),
  targetValue: z.coerce.number().optional().nullable(),
  status: metricStatus.default("UNKNOWN"),
  sourceType: z.string().trim().max(80).optional().nullable(),
  sourceId: z.string().trim().max(160).optional().nullable(),
  lastMeasuredAt: z.coerce.date().optional().nullable()
});

const assetSchema = z.object({
  projectId: nullableId,
  name: z.string().trim().min(1).max(180),
  type: assetType.default("OTHER"),
  status: assetStatus.default("IDEA"),
  description: z.string().trim().max(4000).default(""),
  valueHypothesis: z.string().trim().max(4000).default(""),
  targetCustomer: z.string().trim().max(1000).default(""),
  monthlyRevenueEstimate: z.coerce.number().min(0).default(0),
  monthlyCostEstimate: z.coerce.number().min(0).default(0),
  sourceType: z.string().trim().max(80).optional().nullable(),
  sourceId: z.string().trim().max(160).optional().nullable(),
  tags
});

const revenueStreamSchema = z.object({
  projectId: nullableId,
  assetId: nullableId,
  name: z.string().trim().min(1).max(180),
  model: revenueModel.default("OTHER"),
  status: revenueStatus.default("PLANNED"),
  currency: z.string().trim().min(3).max(8).default("USD"),
  monthlyRevenue: z.coerce.number().min(0).default(0),
  monthlyCost: z.coerce.number().min(0).default(0),
  confidence: z.coerce.number().min(0).max(1).optional().nullable(),
  notes: z.string().trim().max(3000).default(""),
  sourceType: z.string().trim().max(80).optional().nullable(),
  sourceId: z.string().trim().max(160).optional().nullable()
});

const opportunitySchema = z.object({
  projectId: nullableId,
  objectiveId: nullableId,
  assetId: nullableId,
  title: z.string().trim().min(1).max(180),
  problem: z.string().trim().max(4000).default(""),
  proposedValue: z.string().trim().max(4000).default(""),
  targetCustomer: z.string().trim().max(1000).default(""),
  status: opportunityStatus.default("INBOX"),
  priority: priority.default("MEDIUM"),
  confidence: z.coerce.number().min(0).max(1).optional().nullable(),
  score: z.coerce.number().int().min(0).max(100).default(0),
  estimatedMonthlyRevenue: z.coerce.number().min(0).default(0),
  estimatedEffort: z.string().trim().max(400).default(""),
  riskLevel: priority.default("MEDIUM"),
  nextAction: z.string().trim().max(1000).default(""),
  sourceType: z.string().trim().max(80).optional().nullable(),
  sourceId: z.string().trim().max(160).optional().nullable(),
  traceId: z.string().trim().max(160).optional().nullable(),
  tags
});

const experimentSchema = z.object({
  opportunityId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(180),
  hypothesis: z.string().trim().max(3000).default(""),
  validationMethod: z.string().trim().max(3000).default(""),
  successCriteria: z.string().trim().max(3000).default(""),
  status: experimentStatus.default("PLANNED"),
  resultSummary: z.string().trim().max(4000).optional().nullable(),
  resultMetric: z.coerce.number().optional().nullable(),
  startedAt: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable()
});

router.get("/overview", async (_req, res, next) => {
  try {
    res.json({ overview: await getStrategyOverview() });
  } catch (error) {
    next(error);
  }
});

router.get("/objectives", async (_req, res, next) => {
  try {
    res.json({ objectives: await listObjectives() });
  } catch (error) {
    next(error);
  }
});

router.post("/objectives", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    res.status(201).json({ objective: await createObjective(objectiveSchema.parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

router.patch("/objectives/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = idParams.parse(req.params);
    res.json({ objective: await updateObjective(id, objectiveSchema.partial().parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

router.get("/metrics", async (_req, res, next) => {
  try {
    res.json({ metrics: await listMetrics() });
  } catch (error) {
    next(error);
  }
});

router.post("/metrics", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    res.status(201).json({ metric: await createMetric(metricSchema.parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

router.patch("/metrics/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = idParams.parse(req.params);
    res.json({ metric: await updateMetric(id, metricSchema.partial().parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

router.get("/assets", async (_req, res, next) => {
  try {
    res.json({ assets: await listAssets() });
  } catch (error) {
    next(error);
  }
});

router.post("/assets", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    res.status(201).json({ asset: await createAsset(assetSchema.parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

router.patch("/assets/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = idParams.parse(req.params);
    res.json({ asset: await updateAsset(id, assetSchema.partial().parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

router.get("/revenue-streams", async (_req, res, next) => {
  try {
    res.json({ revenueStreams: await listRevenueStreams() });
  } catch (error) {
    next(error);
  }
});

router.post("/revenue-streams", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    res.status(201).json({ revenueStream: await createRevenueStream(revenueStreamSchema.parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

router.patch("/revenue-streams/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = idParams.parse(req.params);
    res.json({ revenueStream: await updateRevenueStream(id, revenueStreamSchema.partial().parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

router.get("/opportunities", async (_req, res, next) => {
  try {
    res.json({ opportunities: await listOpportunities() });
  } catch (error) {
    next(error);
  }
});

router.post("/opportunities", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    res.status(201).json({ opportunity: await createOpportunity(opportunitySchema.parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

router.patch("/opportunities/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = idParams.parse(req.params);
    res.json({ opportunity: await updateOpportunity(id, opportunitySchema.partial().parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

router.post("/opportunities/:id/work-order", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = idParams.parse(req.params);
    res.status(201).json(await createOpportunityWorkOrder(id, { userId: req.user?.id }));
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.get("/experiments", async (_req, res, next) => {
  try {
    res.json({ experiments: await listExperiments() });
  } catch (error) {
    next(error);
  }
});

router.post("/experiments", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    res.status(201).json({ experiment: await createExperiment(experimentSchema.parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

router.patch("/experiments/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = idParams.parse(req.params);
    res.json({ experiment: await updateExperiment(id, experimentSchema.partial().parse(req.body), { userId: req.user?.id }) });
  } catch (error) {
    next(error);
  }
});

export default router;
