import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import {
  listPatchArtifacts,
  getPatchArtifact,
  approvePatchArtifact,
  rejectPatchArtifact,
  requestRevision,
  markPrCreated
} from "../services/patchArtifactService.js";
import { getBooleanSetting } from "../services/settingsService.js";
import { prisma } from "../db/prisma.js";
import { auditLog } from "../services/auditService.js";
import { redactSecrets } from "../services/secretRedactorService.js";

const router = Router();

router.use(requireAuth);

/** GET /api/patch-artifacts — list patch artifacts with optional filters */
router.get("/", async (req, res, next) => {
  try {
    const automationJobId = req.query.automationJobId as string | undefined;
    const workOrderId = req.query.workOrderId as string | undefined;
    const projectId = req.query.projectId as string | undefined;
    const validationStatus = req.query.validationStatus as string | undefined;

    const artifacts = await listPatchArtifacts({
      automationJobId,
      workOrderId,
      projectId,
      validationStatus: validationStatus as never
    });
    res.json(artifacts);
  } catch (err) {
    next(err);
  }
});

/** GET /api/patch-artifacts/:id — get single patch artifact */
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const artifact = await getPatchArtifact(id);
    if (!artifact) {
      res.status(404).json({ error: "PatchArtifact not found" });
      return;
    }
    res.json(artifact);
  } catch (err) {
    next(err);
  }
});

const reviewSchema = z.object({
  reviewNote: z.string().trim().max(2000).optional()
});

/** POST /api/patch-artifacts/:id/approve — KING approves patch */
router.post("/:id/approve", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const body = reviewSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }
    const artifact = await approvePatchArtifact(id, req.user!.id, body.data.reviewNote);
    res.json(artifact);
  } catch (err) {
    if (err instanceof Error && err.name === "NotFoundError") {
      res.status(404).json({ error: err.message });
      return;
    }
    next(err);
  }
});

const rejectSchema = z.object({
  reviewNote: z.string().trim().max(2000).optional()
});

/** POST /api/patch-artifacts/:id/reject — KING rejects patch */
router.post("/:id/reject", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const body = rejectSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }
    const artifact = await rejectPatchArtifact(id, req.user!.id, body.data.reviewNote);
    res.json(artifact);
  } catch (err) {
    if (err instanceof Error && err.name === "NotFoundError") {
      res.status(404).json({ error: err.message });
      return;
    }
    next(err);
  }
});

const revisionSchema = z.object({
  reviewNote: z.string().trim().min(1).max(2000)
});

/** POST /api/patch-artifacts/:id/request-revision — KING requests revision */
router.post("/:id/request-revision", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const body = revisionSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }
    const artifact = await requestRevision(id, req.user!.id, body.data.reviewNote);
    res.json(artifact);
  } catch (err) {
    if (err instanceof Error && err.name === "NotFoundError") {
      res.status(404).json({ error: err.message });
      return;
    }
    next(err);
  }
});

/** POST /api/patch-artifacts/:id/create-pr — KING triggers PR creation via GitHub API */
router.post("/:id/create-pr", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };

    const prEnabled = await getBooleanSetting("ALLOW_RUNNER_PR_CREATE", false);
    if (!prEnabled) {
      res.status(403).json({ error: "PR creation is disabled. Enable ALLOW_RUNNER_PR_CREATE in settings." });
      return;
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      res.status(412).json({ error: "PR creation requires GITHUB_TOKEN environment variable." });
      return;
    }

    const artifact = await getPatchArtifact(id);
    if (!artifact) {
      res.status(404).json({ error: "PatchArtifact not found" });
      return;
    }

    if (artifact.validationStatus !== "APPROVED") {
      res.status(409).json({ error: "Patch must be APPROVED before creating a PR." });
      return;
    }

    if (!artifact.branchPushed || !artifact.branchName) {
      res.status(409).json({ error: "Branch must be pushed before creating a PR." });
      return;
    }

    // Get project repository URL for owner/repo
    const project = artifact.projectId
      ? await prisma.project.findUnique({ where: { id: artifact.projectId }, select: { repositoryUrl: true, name: true } })
      : null;

    const repoUrl = project?.repositoryUrl ?? "";
    const match = repoUrl.match(/github\.com[/:]([\w-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (!match) {
      res.status(412).json({ error: "Could not parse GitHub owner/repo from project.repositoryUrl." });
      return;
    }
    const [, owner, repo] = match;

    // Get implementation report for PR body
    const implReport = await prisma.implementationReport.findFirst({
      where: { automationJobId: artifact.automationJobId },
      orderBy: { createdAt: "desc" }
    });

    const prTitle = `[M17C] ${artifact.workOrder.title}`.slice(0, 100);
    const prBody = buildPrBody(artifact, implReport);

    await auditLog({
      userId: req.user!.id,
      action: "pr_create_requested",
      resourceType: "PatchArtifact",
      resourceId: id,
      metadata: { owner, repo, branchName: artifact.branchName }
    }).catch(() => undefined);

    const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        title: prTitle,
        body: prBody,
        head: artifact.branchName,
        base: "main"
      })
    });

    if (!ghRes.ok) {
      const errText = await ghRes.text().catch(() => "");
      // Redact token from error messages before logging
      const safeErr = redactSecrets(errText);
      res.status(502).json({ error: `GitHub API error: ${ghRes.status}`, detail: safeErr });
      return;
    }

    const ghData = await ghRes.json() as { html_url: string; number: number };
    const updated = await markPrCreated(id, req.user!.id, ghData.html_url);

    await auditLog({
      userId: req.user!.id,
      action: "pr_created",
      resourceType: "PatchArtifact",
      resourceId: id,
      metadata: { prUrl: ghData.html_url, prNumber: ghData.number }
    }).catch(() => undefined);

    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.name === "NotFoundError") {
      res.status(404).json({ error: err.message });
      return;
    }
    next(err);
  }
});

function buildPrBody(
  artifact: { workOrderId: string; workOrder: { id: string; title: string }; automationJobId: string; summary: string; filesChanged: string[]; riskLevel: string; validationResults: unknown },
  implReport: { summary: string; testResult: string; validationCommands?: string[]; errors: string[] } | null
): string {
  const vr = Array.isArray(artifact.validationResults) ? artifact.validationResults as Array<{ command: string; success: boolean; exitCode: number }> : [];
  const lines = [
    `## Summary`,
    artifact.summary,
    ``,
    `## Links`,
    `- Work Order ID: \`${artifact.workOrder.id}\``,
    `- Work Order: ${artifact.workOrder.title}`,
    `- Automation Job ID: \`${artifact.automationJobId}\``,
    ``,
    `## Implementation Report`,
    implReport ? implReport.summary : "_No implementation report_",
    ``,
    `## Files Changed`,
    ...artifact.filesChanged.map((f) => `- \`${f}\``),
    ``,
    `## Validation Results`,
    vr.length > 0
      ? vr.map((v) => `- ${v.success ? "✅" : "❌"} \`${v.command}\` (exit ${v.exitCode})`).join("\n")
      : "_No validation results_",
    ``,
    `## Risk`,
    `Risk level: **${artifact.riskLevel}**`,
    ``,
    `## Rollback`,
    `To rollback: delete this branch and revert any merged changes.`,
    ``,
    `_Generated by AI Kingdom Runner_`
  ];
  return lines.join("\n");
}

export default router;
