import { Archive, Brain, ChevronRight, Link as LinkIcon, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { KnowledgeCategory, KnowledgeMemoryDto } from "@/types/api";

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

function TrustBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    APPROVED: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
    ARCHIVED: "text-muted-foreground border-muted-foreground/20 bg-muted/20",
    LEGACY: "text-amber-400 border-amber-400/30 bg-amber-400/10"
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", colors[level] ?? colors.APPROVED)}>
      <Brain className="h-3 w-3" /> {level}
    </span>
  );
}

export function KnowledgeMemoriesPage() {
  const [memories, setMemories] = useState<KnowledgeMemoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.knowledgeMemories({ category: category || undefined, trustLevel: "APPROVED" });
      setMemories(result.memories);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [category]);

  const handleArchive = async (id: string) => {
    setActing(id);
    try {
      await api.archiveKnowledgeMemory(id);
      await load();
    } finally {
      setActing(null);
    }
  };

  const filtered = memories.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q) || m.tags.some((t) => t.includes(q));
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Approved Memories</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Trusted knowledge available to agents in their prompt context.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="w-full rounded-lg border border-border/60 bg-background pl-9 pr-3 py-1.5 text-sm text-foreground"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingState message="Loading memories..." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No memories" description="No approved memories match the current filters." />
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <div key={m.id} className="rounded-xl border border-border/60 bg-card/60 p-5 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <TrustBadge level={m.trustLevel} />
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", CATEGORY_COLORS[m.category])}>
                      {m.category.replace(/_/g, " ")}
                    </span>
                    {m.useCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        Used {m.useCount}×
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-foreground">{m.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{m.content}</p>
                </div>
                <Button
                 
                  variant="ghost"
                  className="text-muted-foreground hover:text-red-400 shrink-0"
                  disabled={acting === m.id}
                  onClick={() => void handleArchive(m.id)}
                >
                  <Archive className="h-3.5 w-3.5 mr-1.5" /> Archive
                </Button>
              </div>

              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                {m.createdFromTraceId && (
                  <Link to={`/usage-traces/${m.createdFromTraceId}`} className="flex items-center gap-1 hover:text-primary transition-colors">
                    <LinkIcon className="h-3 w-3" /> Source Trace <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
                {m.agentId && (
                  <Link to={`/living-agents/${m.agentId}`} className="flex items-center gap-1 hover:text-primary transition-colors">
                    Agent <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
                {m.approvedByUserId && <span>Approved by: {m.approvedByUserId.slice(-8)}</span>}
                {m.approvedAt && <span>Approved {formatDate(m.approvedAt)}</span>}
                {m.lastUsedAt && <span>Last used {formatDate(m.lastUsedAt)}</span>}
              </div>

              {m.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-muted-foreground/15 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
