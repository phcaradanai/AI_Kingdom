import { Router } from "express";
import { computeDiagnosticsReport } from "../services/kingdomDiagnosticsService.js";

const router = Router();

router.get("/intelligence", async (req, res, next) => {
  try {
    const daysParam = req.query.days;
    let sinceDays: number | undefined;
    if (daysParam !== undefined) {
      const parsed = Number(daysParam);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        res.status(400).json({ error: "Invalid ?days parameter — must be a positive integer" });
        return;
      }
      sinceDays = Math.floor(parsed);
    }
    const report = await computeDiagnosticsReport(sinceDays);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

export default router;
