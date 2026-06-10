import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { hashToken } from "../middleware/runnerAuth.js";
import { prisma } from "../db/prisma.js";
import { listRunners } from "../services/automationJobService.js";
import { z } from "zod";

const router = Router();

/** GET /api/runners — list all runners (KING only, user-JWT auth handled by app.ts) */
router.get("/", requireRole("KING"), async (_req, res, next) => {
  try {
    const runners = await listRunners();
    res.json(runners);
  } catch (err) {
    next(err);
  }
});

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  token: z.string().min(16).max(512)
});

/** POST /api/runners — register a new runner (KING only) */
router.post("/", requireRole("KING"), async (req, res, next) => {
  try {
    const body = registerSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }
    const { name, description, token } = body.data;

    const tokenHash = hashToken(token);
    const existing = await prisma.agentRunner.findUnique({ where: { tokenHash } });
    if (existing) {
      res.status(409).json({ error: "A runner with this token already exists" });
      return;
    }

    const runner = await prisma.agentRunner.create({
      data: { name, description, tokenHash }
    });
    const { tokenHash: _hash, ...safe } = runner;
    res.status(201).json(safe);
  } catch (err) {
    next(err);
  }
});

export default router;
