import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { getCharter, getVision, updateCharter, updateVision } from "../services/charterService.js";

const router = Router();

router.get("/charter", async (_req, res, next) => {
  try {
    const charter = await getCharter();
    if (!charter) {
      res.status(404).json({ error: "Kingdom Charter not found" });
      return;
    }
    res.json({ charter });
  } catch (error) {
    next(error);
  }
});

router.patch("/charter", requireRole("KING"), async (req, res, next) => {
  try {
    const { mission, content } = req.body as { mission?: string; content?: string };
    const charter = await updateCharter({ mission, content });
    res.json({ charter });
  } catch (error) {
    next(error);
  }
});

router.get("/vision", async (_req, res, next) => {
  try {
    const vision = await getVision();
    if (!vision) {
      res.status(404).json({ error: "Kingdom Vision not found" });
      return;
    }
    res.json({ vision });
  } catch (error) {
    next(error);
  }
});

router.patch("/vision", requireRole("KING"), async (req, res, next) => {
  try {
    const { content } = req.body as { content?: string };
    const vision = await updateVision({ content });
    res.json({ vision });
  } catch (error) {
    next(error);
  }
});

export default router;
