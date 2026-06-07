import { AlertTriangle, CheckCircle2, ChevronRight, Clock, GitMerge, Link as LinkIcon, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { KnowledgeCandidateDto, KnowledgeCategory } from "@/types/api";

const CATEGORIES: KnowledgeCategory[] = [
  "PROJECT_FACT", "ARCHITECTURE_DECISION", "USER_PREFERENCE", "PROVIDER_BEHAVIOR",
  "WORKFLOW_RULE", "BUG_LEARNING", "PROMPT_PATTERN", "COST_LEARNING", "RISK", "UNKNOWN"
];

const CATEGORY_COLORS: Record<KnowledgeCategory, string> = {
  PROJECT_FACT: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  ARCHITECTURE_DECISION: "text-purple-400 border-purple-400/30 bg-purple-400/10",
  USER_PREFERENCE: "text-pink-400 border-pink-400/30 bg-pink-400/10",
  PROVIDER_BEHAVIOR: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  WORKFLOW_RULE: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  BUG_LEARNING: "text-red-400 border-red-400/30 bg-red-400/10",
  PROMPT_PATTERN: "text-indigo-400 border-indigo-400/30 bg-indigo-400/10",
  COST_LEARNING: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  RISK: "text-rose-400 border-rose-400/30 bg-rose-400/10",
  UNKNOWN: "text-muted-foreground border-muted-foreground/20 bg-muted/20"
};

function StatusBadge({ status }: { status: string }) {
  const map = {
    PENDING: { icon: Clock, color: "text-amber-400 border-amber-400/30 bg-amber-400/10", label: "Pending" },
    APPROVED: { icon: CheckCircle2, color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10", label: "Approved" },
    REJECTED: { icon: XCircle, color: "text-red-400 border-red-400/30 bg-red-400/10", label: "Rejected" },
    MERGED: { icon: GitMerge, color: "text-violet-400 border-violet-400/30 bg-violet-400/10", label: "Merged" },
    ARCHIVED: { icon: AlertTriangle, color: "text-muted-foreground border-muted-foreground/20 bg-muted/20", label: "Archived" }
  };
  const info = map[status as keyof typeof map] ?? map.ARCHIVED;
  const Icon = info.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", info.color)}>
      <Icon className="h-3 w-3" /> {info.label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number | null }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function KnowledgeCandidatesPage() {
  const [candidates, setCandidates] = useState<KnowledgeCandidateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("PENDING");
  const [category, setCategory] = useState<string>("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.knowledgeCandidates({ status: status || undefined, category: category || undefined });
      setCandidates(result.candidates);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status, category]);

  const handleApprove = async (id: string) => {
    setActing(id);
    try {
      await api.approveCandidate(id);
      await load();
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    setActing(id);
    try {
      await api.rejectCandidate(id, rejectReason);
      setRejectingId(null);
      setRejectReason("");
      await load();
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Knowledge Candidates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review agent-proposed knowledge before it becomes trusted memory.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1.5">
          {["PENDING", "APPROVED", "REJECTED", "MERGED", ""].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                status === s
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40"
              )}
            >
              {s || "All"}
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-border/60 bg-background px-3 py-1 text-xs text-foreground"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingState message="Loading candidates..." />
      ) : candidates.length === 0 ? (
        <EmptyState title="No candidates" description="No knowledge candidates match the current filters." />
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <div key={c.id} className="rounded-xl border border-border/60 bg-card/60 p-5 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <StatusBadge status={c.status} />
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", CATEGORY_COLORS[c.category])}>
                      {c.category.replace(/_/g, " ")}
                    </span>
                    {c.confidence != null && <ConfidenceBar value={c.confidence} />}
                  </div>
                  <h3 className="font-semibold text-foreground">{c.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{c.content}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                {c.traceId && (
                  <Link to={`/usage-traces/${c.traceId}`} className="flex items-center gap-1 hover:text-primary transition-colors">
                    <LinkIcon className="h-3 w-3" /> Trace <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
                {c.taskId && (
                  <span className="flex items-center gap-1">Task: {c.taskId.slice(-8)}</span>
                )}
                {c.agentId && (
                  <Link to={`/living-agents/${c.agentId}`} className="flex items-center gap-1 hover:text-primary transition-colors">
                    Agent <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
                <span>{formatDate(c.createdAt)}</span>
              </div>

              {(() => {
                const meta = (c.metadata && typeof c.metadata === "object") ? (c.metadata as Record<string, any>) : {};
                const targetMemoryId = meta.targetMemoryId;
                const hasDuplicateWarning = !!targetMemoryId;
                const isTraceMissing = !c.traceId;

                return (
                  <div className="space-y-2">
                    {hasDuplicateWarning && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <span>Warning: Duplicate candidate fingerprint already exists in memory. Merge suggestion available.</span>
                          <Link
                            to={`/knowledge-lab/memories?q=${targetMemoryId}`}
                            className="underline text-amber-400 hover:text-amber-300 ml-1 font-semibold"
                          >
                            View existing memory
                          </Link>
                        </div>
                      </div>
                    )}
                    {isTraceMissing && (
                      <div className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-300">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>Warning: Source trace is missing/required for verification.</span>
                      </div>
                    )}
                    {meta.sourceTrust && (
                      <div className="text-[10px] text-muted-foreground">
                        Value Gate Source Trust: <span className="font-semibold text-muted-foreground/90">{meta.sourceTrust}</span>
                        {meta.retentionPolicy && <> | Retention Policy: <span className="font-semibold text-muted-foreground/90">{meta.retentionPolicy}</span></>}
                      </div>
                    )}
                  </div>
                );
              })()}

              {c.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {c.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-muted-foreground/15 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {c.status === "PENDING" && (
                <>
                  {rejectingId === c.id ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Rejection reason..."
                        className="flex-1 min-w-[200px] rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm text-foreground"
                      />
                      <Button variant="destructive" disabled={!rejectReason.trim() || acting === c.id} onClick={() => void handleReject(c.id)}>
                        Confirm Reject
                      </Button>
                      <Button variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" className="border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10" disabled={acting === c.id} onClick={() => void handleApprove(c.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve
                      </Button>
                      <Button variant="outline" className="border-red-400/30 text-red-400 hover:bg-red-400/10" onClick={() => setRejectingId(c.id)}>
                        <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
                      </Button>
                    </div>
                  )}
                </>
              )}

              {c.status === "REJECTED" && c.rejectionReason && (
                <div className="rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs text-red-400/80">
                  Rejected: {c.rejectionReason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
