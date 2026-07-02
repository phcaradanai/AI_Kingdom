/**
 * Goal Decomposition Service
 *
 * Deterministic, zero-AI-call service that transforms a high-level King
 * objective into a structured execution plan: Goal → Phases → Deliverables
 * → WorkOrder templates → Required capabilities.
 *
 * All exported functions are pure (same input → same output, no side effects).
 * `buildExecutionPlanFromInput` is the thin async entry that reads the active
 * agent roster to validate `suggestedRole` slugs against real Kingdom agents.
 */

import { type ProblemType, extractDecreeFrame } from "./decreeFrameService.js";
import { prisma as defaultPrisma } from "../db/prisma.js";

// ── Goal input / output types ────────────────────────────────────────────────

export type GoalPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type GoalInput = {
  title: string;
  objective: string;
  successCriteria: string[];
  constraints: string[];
  priority: GoalPriority;
  projectId?: string | null;
};

export type GoalComplexity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type GoalAnalysis = {
  problemType: ProblemType;
  domainSignals: string[];
  keyQuestions: string[];
  complexity: GoalComplexity;
  parallelizationOpportunity: boolean;
};

export type DeliverableType =
  | "DATABASE_SCHEMA"
  | "CONFIGURATION"
  | "BACKEND_SERVICE"
  | "API_ENDPOINT"
  | "INTEGRATION"
  | "FRONTEND_UI"
  | "TESTING"
  | "DOCUMENTATION";

export type CapabilityRequirement = {
  capability: string;
  rationale: string;
};

export type WorkOrderTemplate = {
  title: string;
  objective: string;
  acceptanceCriteria: string[];
  suggestedRole: string;
};

export type Deliverable = {
  id: string;                         // deterministic: "d0", "d1", …
  title: string;
  description: string;
  type: DeliverableType;
  estimatedComplexity: "LOW" | "MEDIUM" | "HIGH";
  requiredCapabilities: CapabilityRequirement[];
  dependsOn: string[];                // IDs of deliverables that must complete first
  canParallelize: boolean;            // true when no intra-phase dependency blocks it
  workOrderTemplate: WorkOrderTemplate;
};

export type ExecutionPhase = {
  phaseNumber: number;
  phaseTitle: string;
  description: string;
  deliverables: Deliverable[];        // all can run in parallel within this phase
};

export type ExecutionPlan = {
  goalTitle: string;
  goalObjective: string;
  analysis: GoalAnalysis;
  deliverables: Deliverable[];        // flat ordered list (by phase order, stable sort)
  phases: ExecutionPhase[];
  totalDeliverables: number;
  estimatedComplexity: GoalComplexity;
  generatedAt: string;                // ISO timestamp
};

// ── Deliverable detection patterns ──────────────────────────────────────────

type DeliverablePattern = {
  type: DeliverableType;
  keywords: string[];
  title: string;
  description: string;
  suggestedRole: string;
  capabilities: CapabilityRequirement[];
};

/** Phase order — lower number executes first; deliverables at the same number run in parallel. */
const PHASE_ORDER: Record<DeliverableType, number> = {
  DATABASE_SCHEMA: 1,
  CONFIGURATION:   1,
  BACKEND_SERVICE: 2,
  API_ENDPOINT:    2,
  INTEGRATION:     2,
  FRONTEND_UI:     3,
  TESTING:         4,
  DOCUMENTATION:   5,
};

const PHASE_META: Record<number, { title: string; description: string }> = {
  1: { title: "Foundation", description: "Schema, configuration, and infrastructure changes that all later work depends on." },
  2: { title: "Backend", description: "Services, API endpoints, and integrations built on the foundation." },
  3: { title: "Frontend", description: "UI components and pages that surface backend work to the user." },
  4: { title: "Validation", description: "Tests and quality assurance covering all deliverables." },
  5: { title: "Knowledge", description: "Documentation and knowledge capture." },
};

const DELIVERABLE_PATTERNS: DeliverablePattern[] = [
  {
    type: "DATABASE_SCHEMA",
    keywords: ["schema", "migration", "table", "prisma", "model", "column", "foreign key", "database", "ฐานข้อมูล", "สคีมา"],
    title: "Database schema migration",
    description: "Define or alter data models and run a schema migration before any backend work begins.",
    suggestedRole: "royal-architect",
    capabilities: [
      { capability: "prisma-schema", rationale: "Schema changes require Prisma migration expertise." },
      { capability: "database-design", rationale: "New tables/columns must be backward-compatible and well-indexed." },
    ],
  },
  {
    type: "CONFIGURATION",
    keywords: ["config", "environment", "env", "setting", "flag", "feature flag", "infrastructure", "deploy", "docker"],
    title: "Configuration update",
    description: "Add or update environment variables, feature flags, or infrastructure configuration needed by new features.",
    suggestedRole: "royal-architect",
    capabilities: [
      { capability: "env-management", rationale: "Configuration changes affect all environments and require careful review." },
    ],
  },
  {
    type: "API_ENDPOINT",
    keywords: ["api", "endpoint", "route", "rest", "http", "request", "response", "controller", "handler"],
    title: "API endpoint implementation",
    description: "Implement the HTTP route handlers that expose the new capability to clients.",
    suggestedRole: "royal-architect",
    capabilities: [
      { capability: "express-routing", rationale: "Route implementation, request validation, and response shaping." },
      { capability: "rbac", rationale: "Every new route must enforce correct role permission." },
    ],
  },
  {
    type: "BACKEND_SERVICE",
    keywords: ["service", "function", "module", "class", "logic", "business logic", "worker", "job", "orchestrat"],
    title: "Backend service implementation",
    description: "Implement the core business logic service(s) that the API layer calls into.",
    suggestedRole: "royal-architect",
    capabilities: [
      { capability: "service-design", rationale: "Service must be thin, testable, and side-effect-free where possible." },
    ],
  },
  {
    type: "INTEGRATION",
    keywords: ["integrate", "webhook", "external", "third-party", "sdk", "plugin", "connect", "sync", "oauth"],
    title: "External integration",
    description: "Wire up external systems, webhooks, or third-party SDKs.",
    suggestedRole: "royal-architect",
    capabilities: [
      { capability: "external-api", rationale: "Integration code must handle auth, retries, and schema drift." },
    ],
  },
  {
    type: "FRONTEND_UI",
    keywords: ["page", "ui", "component", "react", "frontend", "view", "form", "button", "modal", "display", "render", "layout", "หน้า"],
    title: "Frontend UI implementation",
    description: "Build the React page(s) and components that present the feature to the King.",
    suggestedRole: "royal-architect",
    capabilities: [
      { capability: "react", rationale: "Components must follow the existing shadcn-style pattern." },
      { capability: "zustand", rationale: "State changes go through the kingdom store, not local fetch." },
    ],
  },
  {
    type: "TESTING",
    keywords: ["test", "spec", "coverage", "unit test", "integration test", "e2e", "validate", "verify"],
    title: "Test coverage",
    description: "Write unit and integration tests for all new services, routes, and components.",
    suggestedRole: "royal-general",
    capabilities: [
      { capability: "node-test-runner", rationale: "Tests use Node's built-in runner via tsx." },
    ],
  },
  {
    type: "DOCUMENTATION",
    keywords: ["doc", "documentation", "readme", "changelog", "guide", "wiki", "spec", "write up"],
    title: "Documentation",
    description: "Update docs, README, NEXT_TASK, and any architecture notes to reflect the shipped work.",
    suggestedRole: "royal-archivist",
    capabilities: [
      { capability: "technical-writing", rationale: "Documentation must be accurate and discoverable." },
    ],
  },
];

// ── Complexity scoring ───────────────────────────────────────────────────────

function scoreComplexity(input: GoalInput, deliverableCount: number): GoalComplexity {
  let score = 0;
  score += deliverableCount;
  score += input.successCriteria.length;
  score += input.constraints.length;
  if (input.objective.length > 400) score += 2;
  if (input.priority === "CRITICAL") score += 3;
  if (input.priority === "HIGH") score += 1;
  if (score <= 3) return "LOW";
  if (score <= 7) return "MEDIUM";
  if (score <= 12) return "HIGH";
  return "CRITICAL";
}

// ── Key questions ────────────────────────────────────────────────────────────

const KEY_QUESTIONS_BY_PROBLEM: Record<ProblemType, string[]> = {
  BUG_FIX: [
    "What is the observable symptom and in which component does it appear?",
    "Which test would prove the bug is fixed without breaking existing behaviour?",
    "Are there related paths that share the same root cause?",
  ],
  FEATURE_ADDITION: [
    "What is the minimum deliverable that satisfies every success criterion?",
    "Which existing services or routes can be extended rather than replaced?",
    "What acceptance test would the King run to confirm the feature is complete?",
  ],
  ARCHITECTURE_CHANGE: [
    "What is the migration path that keeps V1 behaviour intact during the transition?",
    "Which downstream consumers will be affected and in what order?",
    "How will we validate correctness after the structural change?",
  ],
  PLAN_REQUEST: [
    "What are the ordered phases and their gate conditions?",
    "Which deliverables block others and which can run in parallel?",
    "What evidence would prove each phase is complete before the next begins?",
  ],
  INFORMATION_REQUEST: [
    "What specific information gap does this goal address?",
    "Where does the authoritative source of truth currently live in the codebase?",
    "How will the findings be captured so the Kingdom can act on them?",
  ],
  DIAGNOSIS: [
    "What data or logs would confirm or rule out the suspected root cause?",
    "What is the minimal reproduction path?",
    "What monitoring or alerting should be added to prevent recurrence?",
  ],
  GENERAL_TASK: [
    "What is the concrete output that marks this goal as complete?",
    "Which agent role is best positioned to lead the first deliverable?",
    "What is the King's acceptance condition?",
  ],
};

// ── Pure functions ───────────────────────────────────────────────────────────

/**
 * Derives structured analysis from the goal text.
 * Reuses the exact keyword scoring from decreeFrameService to stay consistent.
 */
export function analyzeGoal(input: GoalInput): GoalAnalysis {
  const searchText = [input.title, input.objective, ...input.successCriteria].join(" ");
  const frame = extractDecreeFrame(searchText, "BUILD");

  const estimatedDeliverables = identifyDeliverables(input).length;
  const complexity = scoreComplexity(input, estimatedDeliverables);
  const parallelizationOpportunity = estimatedDeliverables >= 2;

  return {
    problemType: frame.problemType,
    domainSignals: frame.domainSignals,
    keyQuestions: KEY_QUESTIONS_BY_PROBLEM[frame.problemType] ?? KEY_QUESTIONS_BY_PROBLEM.GENERAL_TASK,
    complexity,
    parallelizationOpportunity,
  };
}

/**
 * Scans the goal text for deliverable signals and returns a flat list.
 * IDs are assigned in type-phase order so they are stable across calls.
 */
export function identifyDeliverables(input: GoalInput, _analysis?: GoalAnalysis): Deliverable[] {
  const searchText = [input.title, input.objective, ...input.successCriteria, ...input.constraints]
    .join(" ")
    .toLowerCase();

  const matched: DeliverablePattern[] = [];
  for (const pattern of DELIVERABLE_PATTERNS) {
    if (pattern.keywords.some((kw) => searchText.includes(kw))) {
      matched.push(pattern);
    }
  }

  // Always include TESTING when there are implementation deliverables
  const hasImpl = matched.some((p) =>
    ["DATABASE_SCHEMA", "API_ENDPOINT", "BACKEND_SERVICE", "FRONTEND_UI", "INTEGRATION"].includes(p.type)
  );
  const hasTesting = matched.some((p) => p.type === "TESTING");
  if (hasImpl && !hasTesting) {
    const testingPattern = DELIVERABLE_PATTERNS.find((p) => p.type === "TESTING")!;
    matched.push(testingPattern);
  }

  // If no signals at all, return a single generic BACKEND_SERVICE deliverable
  if (matched.length === 0) {
    const fallback = DELIVERABLE_PATTERNS.find((p) => p.type === "BACKEND_SERVICE")!;
    matched.push(fallback);
  }

  // Sort by phase order (stable), then by pattern definition order within a phase
  matched.sort((a, b) => PHASE_ORDER[a.type] - PHASE_ORDER[b.type]);

  return matched.map((pattern, idx) => ({
    id: `d${idx}`,
    title: pattern.title,
    description: pattern.description,
    type: pattern.type,
    estimatedComplexity: estimateDeliverableComplexity(pattern.type, input),
    requiredCapabilities: pattern.capabilities,
    dependsOn: [],   // populated by identifyDependencies
    canParallelize: false, // populated by identifyParallelWork
    workOrderTemplate: {
      title: `${pattern.title} — ${input.title}`,
      objective: pattern.description,
      acceptanceCriteria: buildAcceptanceCriteria(pattern.type, input),
      suggestedRole: pattern.suggestedRole,
    },
  }));
}

function estimateDeliverableComplexity(
  type: DeliverableType,
  input: GoalInput
): "LOW" | "MEDIUM" | "HIGH" {
  if (type === "DOCUMENTATION" || type === "CONFIGURATION") return "LOW";
  if (input.priority === "CRITICAL") return "HIGH";
  if (input.successCriteria.length >= 3) return "MEDIUM";
  return "LOW";
}

function buildAcceptanceCriteria(type: DeliverableType, input: GoalInput): string[] {
  const inherited = input.successCriteria.slice(0, 2);
  const defaults: Record<DeliverableType, string[]> = {
    DATABASE_SCHEMA: ["Migration runs cleanly (prisma migrate deploy)", "Existing tests still pass after migration"],
    CONFIGURATION: ["New config keys are documented in .env.example", "No secrets stored as literal values in code"],
    API_ENDPOINT: ["Route returns correct shape under happy-path and error cases", "Route is protected by requireAuth + correct role"],
    BACKEND_SERVICE: ["Service has unit tests covering the main logic branches", "No direct DB calls from the route handler"],
    INTEGRATION: ["Integration is resilient to external API failure (fallback or error propagation)", "Credentials referenced by env var name only"],
    FRONTEND_UI: ["Page renders without console errors", "All interactive controls meet 44px minimum touch target"],
    TESTING: ["All new code paths are covered by at least one test", "Tests pass against the test database (npm run test:api)"],
    DOCUMENTATION: ["NEXT_TASK.md and ARCHITECTURE.md reflect the shipped change", "No outdated references remain in docs"],
  };
  return [...defaults[type], ...inherited];
}

/**
 * Computes `dependsOn` for each deliverable based on phase ordering.
 * A deliverable depends on ALL deliverables in earlier phases.
 * Mutates the `dependsOn` field in place — call before `identifyParallelWork`.
 */
export function identifyDependencies(deliverables: Deliverable[]): void {
  for (const d of deliverables) {
    const myPhase = PHASE_ORDER[d.type];
    d.dependsOn = deliverables
      .filter((other) => PHASE_ORDER[other.type] < myPhase)
      .map((other) => other.id)
      .sort(); // sort for determinism
  }
}

/**
 * Groups deliverables into parallel execution phases.
 * Deliverables with the same PHASE_ORDER number have no intra-phase dependency
 * and can run simultaneously.
 */
export function identifyParallelWork(deliverables: Deliverable[]): ExecutionPhase[] {
  // Mark canParallelize: true for deliverables that share a phase number
  const phaseCounts = new Map<number, number>();
  for (const d of deliverables) {
    const p = PHASE_ORDER[d.type];
    phaseCounts.set(p, (phaseCounts.get(p) ?? 0) + 1);
  }
  for (const d of deliverables) {
    d.canParallelize = (phaseCounts.get(PHASE_ORDER[d.type]) ?? 0) > 1;
  }

  // Group by phase number in ascending order
  const phaseNums = [...new Set(deliverables.map((d) => PHASE_ORDER[d.type]))].sort(
    (a, b) => a - b
  );

  return phaseNums.map((phaseNum) => {
    const meta = PHASE_META[phaseNum] ?? { title: `Phase ${phaseNum}`, description: "" };
    const phaseDeliverables = deliverables.filter((d) => PHASE_ORDER[d.type] === phaseNum);
    return {
      phaseNumber: phaseNum,
      phaseTitle: meta.title,
      description: meta.description,
      deliverables: phaseDeliverables,
    };
  });
}

/**
 * Capability matching: which capabilities are required across all deliverables.
 * Returns a deduplicated list keyed by capability name.
 */
export function identifyRequiredCapabilities(deliverables: Deliverable[]): CapabilityRequirement[] {
  const seen = new Set<string>();
  const result: CapabilityRequirement[] = [];
  for (const d of deliverables) {
    for (const cap of d.requiredCapabilities) {
      if (!seen.has(cap.capability)) {
        seen.add(cap.capability);
        result.push(cap);
      }
    }
  }
  return result;
}

/**
 * Top-level pure builder. Takes a GoalInput, runs all five analysis steps in
 * sequence, and returns a fully-populated ExecutionPlan.
 *
 * The `generatedAt` field is the only non-deterministic output — it reflects
 * when the plan was built. All other fields are identical for the same input.
 */
export function buildExecutionPlan(input: GoalInput, now?: string): ExecutionPlan {
  const analysis = analyzeGoal(input);
  const deliverables = identifyDeliverables(input, analysis);
  identifyDependencies(deliverables);
  const phases = identifyParallelWork(deliverables);
  const complexity = analysis.complexity;

  return {
    goalTitle: input.title,
    goalObjective: input.objective,
    analysis,
    deliverables,
    phases,
    totalDeliverables: deliverables.length,
    estimatedComplexity: complexity,
    generatedAt: now ?? new Date().toISOString(),
  };
}

// Narrow type so tests can inject a mock without importing PrismaClient
type AgentRosterClient = {
  agent: {
    findMany(args: {
      where: { isActive: boolean; isTestData: boolean };
      select: { slug: boolean; name: boolean };
    }): Promise<Array<{ slug: string; name: string }>>;
  };
};

/**
 * Async wrapper that builds the pure plan then validates each deliverable's
 * `suggestedRole` against the live Kingdom agent roster. If the slug is not
 * present in the active roster it falls back to `royal-architect` (the
 * primary implementation agent for all code/engineering work).
 *
 * This is Step 4 of Phase B1 — reusing existing Kingdom agent capabilities
 * rather than inventing new role names.
 */
export async function buildExecutionPlanFromInput(
  input: GoalInput,
  now?: string,
  db: AgentRosterClient = defaultPrisma
): Promise<ExecutionPlan> {
  const plan = buildExecutionPlan(input, now);

  const activeAgents = await db.agent.findMany({
    where: { isActive: true, isTestData: false },
    select: { slug: true, name: true },
  });
  const activeSlugSet = new Set(activeAgents.map((a) => a.slug));

  // Validate each deliverable's suggestedRole; fall back to royal-architect
  for (const d of plan.deliverables) {
    if (!activeSlugSet.has(d.workOrderTemplate.suggestedRole)) {
      d.workOrderTemplate.suggestedRole = "royal-architect";
    }
  }
  // plan.phases contains the same Deliverable object references, so they are
  // already updated by the loop above — no second pass needed.

  return plan;
}
