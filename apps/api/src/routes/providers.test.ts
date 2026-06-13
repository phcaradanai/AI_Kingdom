import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { createApp } from "../app.js";


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
      email: `providers-${role.toLowerCase()}-${suffix}@aikingdom.local`,
      displayName: `${role} Tester`,
      passwordHash: await bcrypt.hash("StrongPass123", 12),
      role,
      isActive: true
    }
  });
}

async function login(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "StrongPass123" })
  });
  const body = (await response.json().catch(() => null)) as { token?: string };
  return body?.token;
}

test("KING can create a custom provider and then delete it", async () => {
  const user = await createUser("KING");
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, user.email);
      assert.ok(token);

      // Create provider
      const createRes = await fetch(`${baseUrl}/api/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: "Test Custom Provider",
          type: "custom",
          baseUrl: "https://api.custom.com",
          defaultModel: "custom-model",
          priority: 50,
          costTier: "LOW",
          capabilities: { supportsChat: true },
          credentialEnvKey: "TEST_CUSTOM_API_KEY"
        })
      });
      assert.equal(createRes.status, 200);
      const createdBody = await createRes.json() as any;
      assert.equal(createdBody.provider.name, "Test Custom Provider");
      const providerId = createdBody.provider.id;

      // Ensure API keys/secrets are not leaked in the response
      assert.ok(!JSON.stringify(createdBody).includes("TEST_CUSTOM_API_KEY"));

      // Delete provider
      const deleteRes = await fetch(`${baseUrl}/api/providers/${providerId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(deleteRes.status, 200);
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("Creation rejects literal secret keys for credentialEnvKey", async () => {
  const user = await createUser("KING");
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, user.email);
      assert.ok(token);

      const createRes = await fetch(`${baseUrl}/api/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: "Hacker Provider",
          type: "custom",
          baseUrl: "https://api.hacker.com",
          defaultModel: "hacker-model",
          priority: 50,
          costTier: "LOW",
          capabilities: { supportsChat: true },
          credentialEnvKey: "sk-1234567890abcdef" // This should be rejected!
        })
      });
      assert.equal(createRes.status, 400); // Bad Request from Zod validation
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("Non-KING roles cannot manage providers", async () => {
  const user = await createUser("SCRIBE");
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, user.email);
      assert.ok(token);

      const createRes = await fetch(`${baseUrl}/api/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: "Scribe Provider",
          type: "custom",
          defaultModel: "scribe-model",
          priority: 50,
          costTier: "LOW",
          capabilities: { supportsChat: true },
          credentialEnvKey: "SCRIBE_KEY"
        })
      });
      assert.equal(createRes.status, 403); // Forbidden
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
