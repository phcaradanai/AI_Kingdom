import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import {
  listRouteChains,
  getRouteChain,
  createRouteChain,
  updateRouteChain,
  deleteRouteChain,
  duplicateRouteChain
} from "../services/routeChainService.js";

const router = Router();

const entrySchema = z.object({
  providerId: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  isEnabled: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional()
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  taskMode: z.enum(["ASK", "PLAN", "RESEARCH", "BUILD"]).nullable().optional(),
  agentId: z.string().nullable().optional(),
  scope: z.enum(["GLOBAL", "TASK_MODE", "AGENT"]).optional(),
  description: z.string().max(500).nullable().optional(),
  entries: z.array(entrySchema).min(1)
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(500).nullable().optional(),
  entries: z.array(entrySchema).min(1).optional()
});

router.get("/", async (_req, res, next) => {
  try {
    const chains = await listRouteChains();
    res.json({ routeChains: chains });
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const chain = await getRouteChain(req.params.id!);
    if (!chain) return res.status(404).json({ error: "Route chain not found" });
    res.json({ routeChain: chain });
  } catch (err) { next(err); }
});

router.post("/", requireRole("KING"), async (req, res, next) => {
  try {
    const payload = createSchema.parse(req.body);
    const chain = await createRouteChain(payload);
    res.status(201).json({ routeChain: chain });
  } catch (err) { next(err); }
});

router.patch("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    const payload = updateSchema.parse(req.body);
    const chain = await updateRouteChain(req.params.id!, payload);
    res.json({ routeChain: chain });
  } catch (err) { next(err); }
});

router.delete("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    await deleteRouteChain(req.params.id!);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/:id/duplicate", requireRole("KING"), async (req, res, next) => {
  try {
    const chain = await duplicateRouteChain(req.params.id!);
    res.status(201).json({ routeChain: chain });
  } catch (err) { next(err); }
});

export default router;
