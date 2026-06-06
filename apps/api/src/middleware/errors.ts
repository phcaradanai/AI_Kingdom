import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: error.issues[0]?.message ?? "Validation failed",
      details: error.flatten()
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  res.status(500).json({ error: message });
}
