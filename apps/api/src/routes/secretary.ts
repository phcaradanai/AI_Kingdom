import { Router } from "express";
import { generateDailyBrief } from "../services/royalSecretaryService.js";

const router = Router();

router.get("/brief", async (_req, res, next) => {
  try {
    const brief = await generateDailyBrief();
    res.json(brief);
  } catch (error) {
    next(error);
  }
});

export default router;
