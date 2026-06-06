import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditLog } from "../services/auditService.js";

const router = Router();

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true
};

const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number");

const createUserSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"]).default("SCRIBE"),
  isActive: z.boolean().default(true)
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: passwordSchema.optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"]).optional(),
  isActive: z.boolean().optional()
});

router.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: [{ role: "asc" }, { createdAt: "asc" }]
    });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = createUserSchema.parse(req.body);
    const user = await prisma.user.create({
      data: {
        email: payload.email.toLowerCase(),
        displayName: payload.displayName,
        passwordHash: await bcrypt.hash(payload.password, 12),
        role: payload.role,
        isActive: payload.isActive
      },
      select: userSelect
    });
    await auditLog({
      userId: req.user?.id,
      action: "create_user",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email, role: user.role }
    });
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const payload = updateUserSchema.parse(req.body);
    if (await wouldRemoveLastKing(existing.id, payload.role, payload.isActive)) {
      res.status(400).json({ error: "At least one active King account is required" });
      return;
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(payload.email ? { email: payload.email.toLowerCase() } : {}),
        ...(payload.displayName ? { displayName: payload.displayName } : {}),
        ...(payload.role ? { role: payload.role } : {}),
        ...(typeof payload.isActive === "boolean" ? { isActive: payload.isActive } : {}),
        ...(payload.password ? { passwordHash: await bcrypt.hash(payload.password, 12) } : {})
      },
      select: userSelect
    });
    await auditLog({
      userId: req.user?.id,
      action: "update_user",
      resourceType: "user",
      resourceId: user.id,
      metadata: { role: user.role, isActive: user.isActive }
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (await wouldRemoveLastKing(existing.id, existing.role, false)) {
      res.status(400).json({ error: "At least one active King account is required" });
      return;
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { isActive: false },
      select: userSelect
    });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await auditLog({
      userId: req.user?.id,
      action: "delete_user",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email }
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

async function wouldRemoveLastKing(userId: string, nextRole?: string, nextActive?: boolean): Promise<boolean> {
  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current || current.role !== "KING" || !current.isActive) return false;
  const remainsKing = (nextRole ?? current.role) === "KING" && (nextActive ?? current.isActive);
  if (remainsKing) return false;
  const activeKings = await prisma.user.count({
    where: {
      role: "KING",
      isActive: true,
      id: { not: userId }
    }
  });
  return activeKings === 0;
}

export default router;
