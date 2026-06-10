import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";

declare global {
  namespace Express {
    interface Request {
      runner?: { id: string; name: string };
    }
  }
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export { hashToken };

export async function requireRunnerToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "Missing runner token" });
    return;
  }

  try {
    const tokenHash = hashToken(token);
    const runner = await prisma.agentRunner.findUnique({ where: { tokenHash } });

    if (!runner) {
      res.status(401).json({ error: "Invalid runner token" });
      return;
    }

    req.runner = { id: runner.id, name: runner.name };
    next();
  } catch {
    res.status(401).json({ error: "Runner authentication failed" });
  }
}
