import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import bcrypt from "bcryptjs";
import { PrismaClient, type UserRole } from "@prisma/client";
import { createApp } from "../app.js";

const prisma = new PrismaClient();

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const port = (address as AddressInfo).port;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

async function createUser(role: UserRole = "KING") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `auth-${role.toLowerCase()}-${suffix}@aikingdom.local`,
      displayName: `${role} Tester`,
      passwordHash: await bcrypt.hash("StrongPass123", 12),
      role,
      isActive: true
    }
  });
}

async function login(baseUrl: string, email: string, password = "StrongPass123") {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = (await response.json().catch(() => null)) as { token?: string; refreshToken?: string; user?: { role: UserRole } } | null;
  return { response, body };
}

test("login success returns access and refresh tokens and creates audit log", async () => {
  const user = await createUser("KING");
  try {
    await withServer(async (baseUrl) => {
      const { response, body } = await login(baseUrl, user.email);
      assert.equal(response.status, 200);
      assert.ok(body?.token);
      assert.ok(body?.refreshToken);
      assert.equal(body?.user?.role, "KING");

      const audit = await prisma.auditLog.findFirst({
        where: { userId: user.id, action: "login", resourceType: "auth" }
      });
      assert.ok(audit);
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("login failure rejects invalid password", async () => {
  const user = await createUser("KING");
  try {
    await withServer(async (baseUrl) => {
      const { response } = await login(baseUrl, user.email, "WrongPass123");
      assert.equal(response.status, 401);
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("role enforcement denies Scribe access to user management", async () => {
  const user = await createUser("SCRIBE");
  try {
    await withServer(async (baseUrl) => {
      const { body } = await login(baseUrl, user.email);
      const response = await fetch(`${baseUrl}/api/users`, {
        headers: { Authorization: `Bearer ${body?.token}` }
      });
      assert.equal(response.status, 403);
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("logout invalidates the session token", async () => {
  const user = await createUser("KING");
  try {
    await withServer(async (baseUrl) => {
      const { body } = await login(baseUrl, user.email);
      const token = body?.token;
      assert.ok(token);

      const logout = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(logout.status, 204);

      const me = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(me.status, 401);

      const audit = await prisma.auditLog.findFirst({
        where: { userId: user.id, action: "logout", resourceType: "auth" }
      });
      assert.ok(audit);
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
