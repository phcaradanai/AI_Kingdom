import { Router } from "express";
import type { MatterCategory, MatterPriority, MatterStatus } from "@prisma/client";
import { requireRole } from "../middleware/rbac.js";
import { createMatter, deleteMatter, getMatter, listMatters, updateMatter } from "../services/royalSecretaryService.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const status = req.query.status as MatterStatus | undefined;
    const priority = req.query.priority as MatterPriority | undefined;
    const category = req.query.category as MatterCategory | undefined;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const result = await listMatters({ status, priority, category, page, limit });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const matter = await getMatter(req.params.id);
    if (!matter) {
      res.status(404).json({ error: "Matter not found" });
      return;
    }
    res.json({ matter });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("KING"), async (req, res, next) => {
  try {
    const { title, description, priority, category, sourceType, sourceId, assignedAgentId, projectId } = req.body as {
      title: string;
      description: string;
      priority?: MatterPriority;
      category?: MatterCategory;
      sourceType?: string;
      sourceId?: string;
      assignedAgentId?: string;
      projectId?: string;
    };
    if (!title?.trim() || !description?.trim()) {
      res.status(400).json({ error: "title and description are required" });
      return;
    }
    const matter = await createMatter({
      title,
      description,
      ...(priority !== undefined && { priority }),
      ...(category !== undefined && { category }),
      ...(sourceType !== undefined && { sourceType }),
      ...(sourceId !== undefined && { sourceId }),
      ...(assignedAgentId !== undefined && { assignedAgentId }),
      ...(projectId !== undefined && { projectId })
    });
    res.status(201).json({ matter });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await getMatter(id);
    if (!existing) {
      res.status(404).json({ error: "Matter not found" });
      return;
    }
    const { status, priority, category, title, description, assignedAgentId } = req.body as {
      status?: MatterStatus;
      priority?: MatterPriority;
      category?: MatterCategory;
      title?: string;
      description?: string;
      assignedAgentId?: string | null;
    };
    const matter = await updateMatter(id, {
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(category !== undefined && { category }),
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(assignedAgentId !== undefined && { assignedAgentId })
    });
    res.json({ matter });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await getMatter(id);
    if (!existing) {
      res.status(404).json({ error: "Matter not found" });
      return;
    }
    await deleteMatter(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
