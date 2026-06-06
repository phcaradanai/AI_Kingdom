import { ChevronDown, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { MatterCategory, MatterDto, MatterPriority, MatterStatus } from "@/types/api";

const PRIORITY_BADGE: Record<MatterPriority, string> = {
  CRITICAL: "bg-red-500/20 text-red-400",
  HIGH: "bg-orange-500/20 text-orange-400",
  MEDIUM: "bg-yellow-500/20 text-yellow-400",
  LOW: "bg-muted text-muted-foreground"
};

const STATUS_LABELS: Record<MatterStatus, string> = {
  DETECTED: "Detected",
  INVESTIGATING: "Investigating",
  COUNCIL_REVIEW: "Council Review",
  AWAITING_ROYAL_DECISION: "Awaiting Royal Decision",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXECUTING: "Executing",
  COMPLETED: "Completed"
};

const STATUS_COLORS: Record<MatterStatus, string> = {
  DETECTED: "bg-muted text-muted-foreground",
  INVESTIGATING: "bg-blue-500/15 text-blue-400",
  COUNCIL_REVIEW: "bg-purple-500/15 text-purple-400",
  AWAITING_ROYAL_DECISION: "bg-yellow-500/15 text-yellow-400",
  APPROVED: "bg-green-500/15 text-green-400",
  REJECTED: "bg-red-500/15 text-red-400",
  EXECUTING: "bg-cyan-500/15 text-cyan-400",
  COMPLETED: "bg-muted text-muted-foreground"
};

const PRIORITIES: MatterPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const CATEGORIES: MatterCategory[] = ["TREASURY", "SECURITY", "REVENUE", "SYSTEM", "RESEARCH", "PRODUCT", "GENERAL"];
const ALL_STATUSES = Object.keys(STATUS_LABELS) as MatterStatus[];
const UPDATABLE_STATUSES = ALL_STATUSES;

export function MattersPage() {
  const user = useAuthStore((state) => state.user);
  const isKing = user?.role === "KING";
  const canUpdate = user?.role === "KING" || user?.role === "CROWN_PRINCE";

  const [matters, setMatters] = useState<MatterDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<MatterStatus | "">("");
  const [filterPriority, setFilterPriority] = useState<MatterPriority | "">("");
  const [filterCategory, setFilterCategory] = useState<MatterCategory | "">("");
  const [selected, setSelected] = useState<MatterDto | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<MatterPriority>("MEDIUM");
  const [newCategory, setNewCategory] = useState<MatterCategory>("GENERAL");
  const [loading, setLoading] = useState(false);

  const PAGE_SIZE = 25;

  function loadMatters() {
    setLoading(true);
    api.matters({
      status: filterStatus || undefined,
      priority: filterPriority || undefined,
      category: filterCategory || undefined,
      page,
      limit: PAGE_SIZE
    }).then((r) => {
      setMatters(r.matters);
      setTotal(r.total);
    }).catch(() => undefined).finally(() => setLoading(false));
  }

  useEffect(() => { loadMatters(); }, [filterStatus, filterPriority, filterCategory, page]);

  async function updateStatus(matter: MatterDto, status: MatterStatus) {
    if (!canUpdate) return;
    const updated = await api.updateMatter(matter.id, { status });
    setMatters((ms) => ms.map((m) => m.id === updated.matter.id ? updated.matter : m));
    if (selected?.id === matter.id) setSelected(updated.matter);
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newDesc.trim()) return;
    const res = await api.createMatter({ title: newTitle, description: newDesc, priority: newPriority, category: newCategory });
    setMatters((ms) => [res.matter, ...ms]);
    setNewTitle(""); setNewDesc(""); setNewPriority("MEDIUM"); setNewCategory("GENERAL"); setShowCreate(false);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader eyebrow="Royal Secretary" title="Matters of the Realm" description="Issues, decisions, and initiatives requiring royal oversight." />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value as MatterStatus | ""); setPage(1); }}
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          value={filterPriority}
          onChange={(e) => { setFilterPriority(e.target.value as MatterPriority | ""); setPage(1); }}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value as MatterCategory | ""); setPage(1); }}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {isKing && (
          <Button className="ml-auto" onClick={() => setShowCreate((v) => !v)} variant={showCreate ? "outline" : "primary"}>
            <Plus className="h-4 w-4" />
            New Matter
          </Button>
        )}
      </div>

      {/* Create form */}
      {showCreate && isKing && (
        <Card className="mb-4 p-4">
          <h3 className="mb-3 text-sm font-semibold">Raise a Matter of the Realm</h3>
          <div className="space-y-3">
            <Input placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <textarea
              className="h-24 w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Description"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as MatterPriority)}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MatterCategory)}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Button onClick={handleCreate}>Raise Matter</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="flex gap-4">
        {/* List */}
        <div className="min-w-0 flex-1 space-y-2">
          {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}
          {!loading && matters.length === 0 && (
            <Card className="py-12 text-center text-sm text-muted-foreground">
              No matters of the realm found.
            </Card>
          )}
          {!loading && matters.map((m) => (
            <div
              key={m.id}
              onClick={() => setSelected(m.id === selected?.id ? null : m)}
              className={cn(
                "cursor-pointer rounded-lg border border-border p-4 transition-colors hover:bg-muted/40",
                m.id === selected?.id && "ring-1 ring-primary bg-primary/5"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PRIORITY_BADGE[m.priority])}>{m.priority}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[m.status])}>{STATUS_LABELS[m.status]}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{m.category}</span>
                  </div>
                  <div className="mt-1 font-medium text-sm">{m.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{m.description}</div>
                  <div className="mt-1 text-xs text-muted-foreground/60">{formatDate(m.createdAt)}</div>
                </div>
              </div>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
              <span>{total} matter{total !== 1 ? "s" : ""}</span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 px-3">Prev</Button>
                <span className="flex items-center">{page} / {totalPages}</span>
                <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 px-3">Next</Button>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 shrink-0">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PRIORITY_BADGE[selected.priority])}>{selected.priority}</span>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <h3 className="mt-3 font-semibold">{selected.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{selected.description}</p>
              <dl className="mt-4 space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between"><dt>Status</dt><dd><span className={cn("rounded-full px-2 py-0.5", STATUS_COLORS[selected.status])}>{STATUS_LABELS[selected.status]}</span></dd></div>
                <div className="flex justify-between"><dt>Category</dt><dd>{selected.category}</dd></div>
                <div className="flex justify-between"><dt>Raised</dt><dd>{formatDate(selected.createdAt)}</dd></div>
                {selected.sourceType && <div className="flex justify-between"><dt>Source</dt><dd>{selected.sourceType}</dd></div>}
              </dl>
              {canUpdate && (
                <div className="mt-4">
                  <label className="text-xs text-muted-foreground">Update Status</label>
                  <div className="mt-1 flex items-center gap-2">
                    <select
                      className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                      defaultValue={selected.status}
                      onChange={(e) => updateStatus(selected, e.target.value as MatterStatus)}
                    >
                      {UPDATABLE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                    <ChevronDown className="h-4 w-4 text-muted-foreground -ml-7 pointer-events-none" />
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
