import { Router } from "express";
import { prisma } from "../db/prisma.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const sessions = await prisma.councilSession.findMany({
      where: {
        task: {
          createdBy: userId
        }
      },
      include: {
        task: true,
        reports: true,
        responses: {
          include: { agent: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ sessions });
  } catch (error) {
    next(error);
  }
});

router.get("/:sessionId", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const session = await prisma.councilSession.findFirst({
      where: {
        id: req.params.sessionId,
        task: {
          createdBy: userId
        }
      },
      include: {
        task: true,
        reports: true,
        responses: {
          include: { agent: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!session) {
      res.status(404).json({ error: "Council session not found" });
      return;
    }

    res.json({ session });
  } catch (error) {
    next(error);
  }
});

export default router;
