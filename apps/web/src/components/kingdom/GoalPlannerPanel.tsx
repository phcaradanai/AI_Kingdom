import { AlertCircle, ChevronDown, ChevronRight, Loader2, Target, Zap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/SectionCard";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { GoalDeliverableDto, GoalExecutionPhaseDto, GoalExecutionPlanDto } from "@/types/api";

// ── Deliverable type badge colours ───────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  DATABASE_SCHEMA: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  CONFIGURATION:   "border-slate-500/40 bg-slate-500/10 text-slate-300",
  API_ENDPOINT:    "border-blue-500/40 bg-blue-500/10 text-blue-300",
  BACKEND_SERVICE: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  INTEGRATION:     "border-teal-500/40 bg-teal-500/10 text-teal-300",
  FRONTEND_UI:     "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  TESTING:         "border-amber-500/40 bg-amber-500/10 text-amber-300",
  DOCUMENTATION:   "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

const COMPLEXITY_COLORS: Record<string, string> = {
  LOW:      "text-emerald-400",
  MEDIUM:   "text-amber-400",
  HIGH:     "text-orange-400",
  CRITICAL: "text-red-400",
};

// ── Deliverable row ───────────────────────────────────────────────────────────

function DeliverableRow({ d, index }: { d: GoalDeliverableDto; index: number }) {
  const [open, setOpen] = useState(false);
  const typeColor = TYPE_COLORS[d.type] ?? "border-muted/40 bg-muted/10 text-muted-foreground";

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/10 transition-colors"
      >
        <span className="mt-0.5 min-w-[1.5rem] text-center text-xs font-bold text-muted-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{d.title}</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", typeColor)}>
              {d.type.replace(/_/g, " ")}
            </span>
            {d.canParallelize && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                ⚡ parallel
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{d.description}</p>
        </div>
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="bg-muted/5 px-12 pb-4 space-y-3">
          {d.workOrderTemplate.acceptanceCriteria.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Acceptance criteria
              </p>
              <ul className="space-y-1">
                {d.workOrderTemplate.acceptanceCriteria.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 text-emerald-400">✓</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.requiredCapabilities.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Required capabilities
              </p>
              <div className="flex flex-wrap gap-2">
                {d.requiredCapabilities.map((cap) => (
                  <span
                    key={cap.capability}
                    title={cap.rationale}
                    className="rounded border border-border/50 bg-muted/10 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {cap.capability}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span>
              Role: <span className="text-foreground font-medium">{d.workOrderTemplate.suggestedRole}</span>
            </span>
            <span>
              Complexity:{" "}
              <span className={cn("font-bold", COMPLEXITY_COLORS[d.estimatedComplexity])}>
                {d.estimatedComplexity}
              </span>
            </span>
            {d.dependsOn.length > 0 && (
              <span>
                Depends on:{" "}
                <span className="text-foreground">{d.dependsOn.join(", ")}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Phase section ─────────────────────────────────────────────────────────────

function PhaseSection({ phase, deliverableOffset }: { phase: GoalExecutionPhaseDto; deliverableOffset: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/10 border-b border-border/30">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
          {phase.phaseNumber}
        </span>
        <span className="text-xs font-bold text-foreground">{phase.phaseTitle}</span>
        <span className="text-[11px] text-muted-foreground">— {phase.description}</span>
        {phase.deliverables.length > 1 && (
          <span className="ml-auto text-[10px] font-bold text-primary/70">
            {phase.deliverables.length} in parallel
          </span>
        )}
      </div>
      {phase.deliverables.map((d, i) => (
        <DeliverableRow key={d.id} d={d} index={deliverableOffset + i} />
      ))}
    </div>
  );
}

// ── Plan result view ──────────────────────────────────────────────────────────

function PlanView({ plan }: { plan: GoalExecutionPlanDto }) {
  let offset = 0;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-border/50 bg-muted/10 px-4 py-3 text-sm">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Problem type</span>
          <p className="mt-0.5 font-medium text-foreground">
            {plan.analysis.problemType.replace(/_/g, " ")}
          </p>
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Complexity</span>
          <p className={cn("mt-0.5 font-bold", COMPLEXITY_COLORS[plan.estimatedComplexity])}>
            {plan.estimatedComplexity}
          </p>
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Deliverables</span>
          <p className="mt-0.5 font-medium text-foreground">{plan.totalDeliverables}</p>
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Phases</span>
          <p className="mt-0.5 font-medium text-foreground">{plan.phases.length}</p>
        </div>
        {plan.analysis.parallelizationOpportunity && (
          <div className="ml-auto flex items-center gap-1.5 text-primary text-xs font-bold">
            <Zap className="h-3 w-3" />
            Parallelization opportunity
          </div>
        )}
      </div>

      {/* Domain signals */}
      {plan.analysis.domainSignals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {plan.analysis.domainSignals.map((s) => (
            <span
              key={s}
              className="rounded-full border border-border/50 bg-muted/10 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Key questions */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Key questions for this goal
        </p>
        <ul className="space-y-1">
          {plan.analysis.keyQuestions.map((q, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="mt-0.5 font-bold text-primary/70">{i + 1}.</span>
              <span>{q}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Execution phases */}
      <div className="rounded-lg border border-border/50 overflow-hidden">
        {plan.phases.map((phase) => {
          const node = <PhaseSection key={phase.phaseNumber} phase={phase} deliverableOffset={offset} />;
          offset += phase.deliverables.length;
          return node;
        })}
      </div>
    </div>
  );
}

// ── GoalPlannerPanel (exported) ───────────────────────────────────────────────

export function GoalPlannerPanel() {
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [criteria, setCriteria] = useState("");
  const [constraints, setConstraints] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<GoalExecutionPlanDto | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !objective.trim()) return;
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const result = await api.analyzeGoal({
        title: title.trim(),
        objective: objective.trim(),
        successCriteria: criteria.split("\n").map((s) => s.trim()).filter(Boolean),
        constraints: constraints.split("\n").map((s) => s.trim()).filter(Boolean),
        priority,
      });
      setPlan(result.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Goal analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title="Goal Decomposition"
      icon={Target}
      action={
        plan ? (
          <button
            type="button"
            onClick={() => setPlan(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline"
          >
            New goal
          </button>
        ) : undefined
      }
    >
      {!plan ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 p-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Goal title *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add user notification preferences"
              required
              className="w-full rounded-md border border-border/50 bg-muted/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Objective *
            </label>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Describe what you want to achieve and why"
              required
              rows={3}
              className="w-full rounded-md border border-border/50 bg-muted/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Success criteria (one per line)
              </label>
              <textarea
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
                placeholder={"Settings persist across sessions\nUI has 44px minimum controls"}
                rows={3}
                className="w-full rounded-md border border-border/50 bg-muted/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
              />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Constraints (one per line)
                </label>
                <textarea
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  placeholder={"Must not break existing routes"}
                  rows={2}
                  className="w-full rounded-md border border-border/50 bg-muted/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                  className="w-full rounded-md border border-border/50 bg-muted/10 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading || !title.trim() || !objective.trim()} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            {loading ? "Analysing…" : "Decompose goal"}
          </Button>
        </form>
      ) : (
        <div className="p-3">
          <div className="mb-3">
            <p className="text-xs font-bold text-foreground">{plan.goalTitle}</p>
            <p className="text-xs text-muted-foreground">{plan.goalObjective}</p>
          </div>
          <PlanView plan={plan} />
        </div>
      )}
    </SectionCard>
  );
}
