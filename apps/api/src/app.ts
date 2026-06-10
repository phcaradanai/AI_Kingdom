import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import morgan from "morgan";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errors.js";
import { requirePermission, requireRole } from "./middleware/rbac.js";
import agentActivitiesRouter from "./routes/agentActivities.js";
import knowledgeCandidatesRouter from "./routes/knowledgeCandidates.js";
import knowledgeMemoriesRouter from "./routes/knowledgeMemories.js";
import livingAgentsRouter from "./routes/livingAgents.js";
import agentsRouter from "./routes/agents.js";
import artifactsRouter from "./routes/artifacts.js";
import auditRouter from "./routes/audit.js";
import authRouter from "./routes/auth.js";
import charterRouter from "./routes/charter.js";
import externalAgentsRouter from "./routes/externalAgents.js";
import handoffBriefsRouter from "./routes/handoffBriefs.js";
import implementationReportsRouter from "./routes/implementationReports.js";
import mattersRouter from "./routes/matters.js";
import modelPricingRouter from "./routes/modelPricing.js";
import noticesRouter from "./routes/notices.js";
import providerBalancesRouter from "./routes/providerBalances.js";
import providersRouter from "./routes/providers.js";
import projectInboxRouter from "./routes/projectInbox.js";
import projectRoutingRouter from "./routes/projectRouting.js";
import projectsRouter from "./routes/projects.js";
import secretaryRouter from "./routes/secretary.js";
import councilRouter from "./routes/council.js";
import memoriesRouter from "./routes/memories.js";
import reportsRouter from "./routes/reports.js";
import settingsRouter from "./routes/settings.js";
import tasksRouter from "./routes/tasks.js";
import treasuryRouter from "./routes/treasury.js";
import usageTracesRouter from "./routes/usageTraces.js";
import usersRouter from "./routes/users.js";
import workOrdersRouter from "./routes/workOrders.js";
import workSessionsRouter from "./routes/workSessions.js";
import routeChainsRouter from "./routes/routeChains.js";
import runnersRouter from "./routes/runners.js";
import automationJobsRouter from "./routes/automationJobs.js";
import runnerJobsRouter from "./routes/runnerJobs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../../uploads");

export function createApp() {
  const app = express();
  const allowedOrigins = (env.CORS_ALLOWED_ORIGINS ?? env.CORS_ORIGIN)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || /^http:\/\/localhost:51\d{2}$/.test(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS origin not allowed: ${origin}`));
      }
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));
  app.use(
    "/uploads",
    express.static(uploadsDir, {
      setHeaders(res) {
        // Helmet sets Cross-Origin-Resource-Policy: same-origin globally, which blocks
        // cross-origin <img> loads (frontend :5173 → API :4000). Override for public uploads only.
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      }
    })
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "api" });
  });

  app.get("/health/db", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, database: "reachable" });
    } catch {
      res.status(503).json({ ok: false, database: "unreachable" });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/agent-activities", requireAuth, agentActivitiesRouter);
  app.use("/api/living-agents", requireAuth, livingAgentsRouter);
  app.use("/api/agents", requireAuth, requireRole("KING"), agentsRouter);
  app.use("/api/tasks", requireAuth, methodPermission("tasks"), tasksRouter);
  app.use("/api/council", requireAuth, methodPermission("council"), councilRouter);
  app.use("/api/reports", requireAuth, methodPermission("reports"), reportsRouter);
  app.use("/api/settings", requireAuth, requireRole("KING"), settingsRouter);
  app.use("/api/providers", requireAuth, requireRole("KING"), providersRouter);
  app.use("/api/provider-balances", requireAuth, requireRole("KING"), providerBalancesRouter);
  app.use("/api/projects", requireAuth, projectsRouter);
  app.use("/api/project-routing", requireAuth, projectRoutingRouter);
  app.use("/api/project-inbox", requireAuth, projectInboxRouter);
  app.use("/api/artifacts", requireAuth, artifactsRouter);
  app.use("/api/external-agents", requireAuth, externalAgentsRouter);
  app.use("/api/work-orders", requireAuth, workOrdersRouter);
  app.use("/api/work-sessions", requireAuth, workSessionsRouter);
  app.use("/api/implementation-reports", requireAuth, implementationReportsRouter);
  app.use("/api/handoff-briefs", requireAuth, handoffBriefsRouter);
  app.use("/api/users", requireAuth, requireRole("KING"), usersRouter);
  app.use("/api/memory", requireAuth, methodPermission("memory"), memoriesRouter);
  app.use("/api/memories", requireAuth, methodPermission("memory"), memoriesRouter);
  app.use("/api/treasury", requireAuth, requireRole("KING"), treasuryRouter);
  app.use("/api/usage-traces", requireAuth, usageTracesRouter);
  app.use("/api/knowledge-candidates", requireAuth, knowledgeCandidatesRouter);
  app.use("/api/knowledge-memories", requireAuth, knowledgeMemoriesRouter);
  app.use("/api/route-chains", requireAuth, routeChainsRouter);
  // User-facing (JWT) routes for managing runners and automation jobs
  app.use("/api/runners", requireAuth, runnersRouter);
  app.use("/api/automation-jobs", requireAuth, automationJobsRouter);
  // Runner-token authenticated routes — NO requireAuth, uses requireRunnerToken inside router
  app.use("/api/runner", runnerJobsRouter);
  app.use("/api/model-pricing", requireAuth, requireRole("KING"), modelPricingRouter);
  app.use("/api/audit", requireAuth, requireRole("KING"), auditRouter);
  app.use("/api/secretary", requireAuth, secretaryRouter);
  app.use("/api/notices", requireAuth, noticesRouter);
  app.use("/api/matters", requireAuth, mattersRouter);
  app.use("/api", requireAuth, charterRouter);
  app.use(errorHandler);

  return app;
}

function methodPermission(resource: Parameters<typeof requirePermission>[0]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const action = req.method === "GET" || req.method === "HEAD" ? "read" : "write";
    return requirePermission(resource, action)(req, res, next);
  };
}
