import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";

type Resource = "agents" | "settings" | "users" | "memory" | "reports" | "council" | "tasks";
type Action = "read" | "write";

const writableResourcesByRole: Record<UserRole, Resource[]> = {
  KING: ["agents", "settings", "users", "memory", "reports", "council", "tasks"],
  CROWN_PRINCE: ["memory", "reports", "council", "tasks"],
  MINISTER: ["reports", "tasks"],
  SCRIBE: []
};

const readableResourcesByRole: Record<UserRole, Resource[]> = {
  KING: ["agents", "settings", "users", "memory", "reports", "council", "tasks"],
  CROWN_PRINCE: ["memory", "reports", "council", "tasks"],
  MINISTER: ["reports", "tasks"],
  SCRIBE: ["memory", "reports", "council", "tasks"]
};

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Permission denied" });
      return;
    }
    next();
  };
}

export function requirePermission(resource: Resource, action: Action = "read") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const allowed = action === "read" ? readableResourcesByRole[req.user.role] : writableResourcesByRole[req.user.role];
    if (!allowed.includes(resource)) {
      res.status(403).json({ error: "Permission denied" });
      return;
    }
    next();
  };
}
