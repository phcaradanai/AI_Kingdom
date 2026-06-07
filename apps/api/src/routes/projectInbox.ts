import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { confirmInboxAssignment } from "../services/projectRoutingService.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const inboxItems = await prisma.projectInboxItem.findMany({
      where: { isTestData: false, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: "desc" }
    });
    res.json({ inboxItems });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/assign", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { projectId } = z.object({ projectId: z.string().trim().min(1) }).parse(req.body);
    const inboxItem = await confirmInboxAssignment(id, projectId);
    res.json({ inboxItem });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.patch("/:id/dismiss", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const inboxItem = await prisma.projectInboxItem.update({ where: { id }, data: { status: "DISMISSED" } });
    res.json({ inboxItem });
  } catch (error) {
    next(error);
  }
});

export default router;
