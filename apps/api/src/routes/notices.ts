import { Router } from "express";
import type { NoticeSeverity, NoticeStatus } from "@prisma/client";
import { requireRole } from "../middleware/rbac.js";
import { createNotice, deleteNotice, getNotice, listNotices, updateNotice } from "../services/royalSecretaryService.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const severity = req.query.severity as NoticeSeverity | undefined;
    const status = req.query.status as NoticeStatus | undefined;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const result = await listNotices({ severity, status, page, limit });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const notice = await getNotice(req.params.id);
    if (!notice) {
      res.status(404).json({ error: "Notice not found" });
      return;
    }
    res.json({ notice });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("KING"), async (req, res, next) => {
  try {
    const { title, content, severity, sourceType, sourceId, createdByAgentId } = req.body as {
      title: string;
      content: string;
      severity?: NoticeSeverity;
      sourceType?: string;
      sourceId?: string;
      createdByAgentId?: string;
    };
    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: "title and content are required" });
      return;
    }
    const notice = await createNotice({
      title,
      content,
      ...(severity !== undefined && { severity }),
      ...(sourceType !== undefined && { sourceType }),
      ...(sourceId !== undefined && { sourceId }),
      ...(createdByAgentId !== undefined && { createdByAgentId })
    });
    res.status(201).json({ notice });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await getNotice(id);
    if (!existing) {
      res.status(404).json({ error: "Notice not found" });
      return;
    }
    const { status, title, content, severity } = req.body as {
      status?: NoticeStatus;
      title?: string;
      content?: string;
      severity?: NoticeSeverity;
    };
    const notice = await updateNotice(id, {
      ...(status !== undefined && { status }),
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(severity !== undefined && { severity })
    });
    res.json({ notice });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await getNotice(id);
    if (!existing) {
      res.status(404).json({ error: "Notice not found" });
      return;
    }
    await deleteNotice(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
