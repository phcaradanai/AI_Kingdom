import type { NextFunction, Request, Response } from "express";

const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(options: { windowMs: number; max: number }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const current = attempts.get(key);

    if (!current || current.resetAt < now) {
      attempts.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.max) {
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }

    current.count += 1;
    next();
  };
}
