import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  sessionId: string;
};

type AccessTokenPayload = AuthUser & {
  type: "access";
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ ...user, type: "access" }, env.JWT_SECRET, { expiresIn: "15m" });
}

export function verifyToken<T>(token: string): T {
  return jwt.verify(token, env.JWT_SECRET) as T;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  try {
    const payload = verifyToken<AccessTokenPayload>(token);
    if (payload.type !== "access") {
      res.status(401).json({ error: "Invalid token type" });
      return;
    }

    const session = await prisma.refreshToken.findUnique({ where: { id: payload.sessionId } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      res.status(401).json({ error: "Session expired or revoked" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user?.isActive) {
      res.status(401).json({ error: "User is inactive" });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      sessionId: payload.sessionId
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
