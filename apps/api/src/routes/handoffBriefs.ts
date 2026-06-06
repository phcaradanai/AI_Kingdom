import { Router } from "express";
import { prisma } from "../db/prisma.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const handoffBriefs = await prisma.handoffBrief.findMany({
      include: { workOrder: true, fromWorkSession: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ handoffBriefs });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const handoffBrief = await prisma.handoffBrief.findUnique({
      where: { id: req.params.id },
      include: { workOrder: true, fromWorkSession: true }
    });
    if (!handoffBrief) {
      res.status(404).json({ error: "Handoff brief not found" });
      return;
    }
    res.json({ handoffBrief });
  } catch (error) {
    next(error);
  }
});

export default router;
