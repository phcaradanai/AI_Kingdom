import { Router } from "express";
import { getAuditLogEntry, listAuditLogs, searchAuditLogs } from "../services/auditService.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const resourceType = typeof req.query.resourceType === "string" ? req.query.resourceType : undefined;
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    const result = await listAuditLogs({ page, limit, action, resourceType, userId, startDate, endDate });
    res.json({ logs: result.logs, total: result.total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get("/search", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const result = await searchAuditLogs(q, { page, limit });
    res.json({ logs: result.logs, total: result.total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const entry = await getAuditLogEntry(req.params.id);
    if (!entry) {
      res.status(404).json({ error: "Audit log entry not found" });
      return;
    }
    res.json({ log: entry });
  } catch (error) {
    next(error);
  }
});

export default router;
