import { Router } from "express";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { requireAuth, signAccessToken, verifyToken, type AuthUser } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { auditLog } from "../services/auditService.js";

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

type RefreshTokenPayload = {
  type: "refresh";
  userId: string;
  sessionId: string;
};

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const refreshTokenDays = 14;

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = credentialsSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user?.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const session = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(`${user.id}:${Date.now()}:${Math.random()}`),
        expiresAt: new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000)
      }
    });
    const publicUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive
    };
    const authUser: AuthUser = { ...publicUser, sessionId: session.id };
    const accessToken = signAccessToken(authUser);
    const refreshToken = signRefreshToken({ userId: user.id, sessionId: session.id });

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: session.id },
        data: { tokenHash: hashToken(refreshToken) }
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "login",
          resourceType: "auth",
          resourceId: session.id,
          metadata: { email: user.email }
        }
      })
    ]);

    res.json({ token: accessToken, accessToken, refreshToken, user: publicUser });
  } catch (error) {
    next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const payload = verifyToken<RefreshTokenPayload>(refreshToken);
    if (payload.type !== "refresh") {
      res.status(401).json({ error: "Invalid token type" });
      return;
    }

    const session = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (!session || session.id !== payload.sessionId || session.userId !== payload.userId || session.revokedAt || session.expiresAt < new Date()) {
      res.status(401).json({ error: "Refresh token expired or revoked" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user?.isActive) {
      res.status(401).json({ error: "User is inactive" });
      return;
    }

    const publicUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive
    };
    const accessToken = signAccessToken({ ...publicUser, sessionId: session.id });
    res.json({ token: accessToken, accessToken, user: publicUser });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }
    next(error);
  }
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await prisma.refreshToken.updateMany({
      where: { id: req.user!.sessionId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await auditLog({
      userId: req.user!.id,
      action: "logout",
      resourceType: "auth",
      resourceId: req.user!.sessionId
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user!.id,
      email: req.user!.email,
      displayName: req.user!.displayName,
      role: req.user!.role,
      isActive: true
    }
  });
});

function signRefreshToken(input: { userId: string; sessionId: string }): string {
  return jwt.sign({ ...input, type: "refresh" }, env.JWT_SECRET, { expiresIn: `${refreshTokenDays}d` });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export default router;
