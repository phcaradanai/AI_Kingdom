import { Archive, Bell, CheckCheck, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { NoticeDto, NoticeSeverity, NoticeStatus } from "@/types/api";

const SEVERITY_STYLES: Record<NoticeSeverity, string> = {
  CRITICAL: "border-red-500/40 bg-red-500/8 text-red-300",
  WARNING: "border-yellow-500/40 bg-yellow-500/8 text-yellow-300",
  INFO: "border-border bg-muted/20 text-foreground"
};

const SEVERITY_BADGE: Record<NoticeSeverity, string> = {
  CRITICAL: "bg-red-500/20 text-red-400",
  WARNING: "bg-yellow-500/20 text-yellow-400",
  INFO: "bg-blue-500/20 text-blue-400"
};

const SEVERITIES: NoticeSeverity[] = ["CRITICAL", "WARNING", "INFO"];
const STATUSES: NoticeStatus[] = ["UNREAD", "READ", "ARCHIVED"];

export function NoticesPage() {
  const user = useAuthStore((state) => state.user);
  const isKing = user?.role === "KING";
  const canUpdate = user?.role === "KING" || user?.role === "CROWN_PRINCE";

  const [notices, setNotices] = useState<NoticeDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterSeverity, setFilterSeverity] = useState<NoticeSeverity | "">("");
  const [filterStatus, setFilterStatus] = useState<NoticeStatus | "">("");
  const [selected, setSelected] = useState<NoticeDto | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newSeverity, setNewSeverity] = useState<NoticeSeverity>("INFO");
  const [loading, setLoading] = useState(false);

  const PAGE_SIZE = 25;

  function loadNotices() {
    setLoading(true);
    api.notices({
      severity: filterSeverity || undefined,
      status: filterStatus || undefined,
      page,
      limit: PAGE_SIZE
    }).then((r) => {
      setNotices(r.notices);
      setTotal(r.total);
    }).catch(() => undefined).finally(() => setLoading(false));
  }

  useEffect(() => { loadNotices(); }, [filterSeverity, filterStatus, page]);

  async function markRead(notice: NoticeDto) {
    if (!canUpdate || notice.status === "READ") return;
    const updated = await api.updateNotice(notice.id, { status: "READ" });
    setNotices((ns) => ns.map((n) => n.id === updated.notice.id ? updated.notice : n));
    if (selected?.id === notice.id) setSelected(updated.notice);
  }

  async function archiveNotice(notice: NoticeDto) {
    if (!canUpdate) return;
    const updated = await api.updateNotice(notice.id, { status: "ARCHIVED" });
    setNotices((ns) => ns.map((n) => n.id === updated.notice.id ? updated.notice : n));
    if (selected?.id === notice.id) setSelected(null);
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newContent.trim()) return;
    const res = await api.createNotice({ title: newTitle, content: newContent, severity: newSeverity });
    setNotices((ns) => [res.notice, ...ns]);
    setNewTitle(""); setNewContent(""); setNewSeverity("INFO"); setShowCreate(false);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader eyebrow="Royal Secretary" title="Royal Notices" description="Important signals, alerts, and notices from across the Kingdom." />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          value={filterSeverity}
          onChange={(e) => { setFilterSeverity(e.target.value as NoticeSeverity | ""); setPage(1); }}
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value as NoticeStatus | ""); setPage(1); }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          {isKing && (
            <Button onClick={() => setShowCreate((v) => !v)} variant={showCreate ? "outline" : "primary"}>
              <Plus className="h-4 w-4" />
              New Notice
            </Button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showCreate && isKing && (
        <Card className="mb-4 p-4">
          <h3 className="mb-3 text-sm font-semibold">Create Royal Notice</h3>
          <div className="space-y-3">
            <Input placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <textarea
              className="h-24 w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Content"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as NoticeSeverity)}
              >
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button onClick={handleCreate}>Create</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="flex gap-4">
        {/* List */}
        <div className="min-w-0 flex-1 space-y-2">
          {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}
          {!loading && notices.length === 0 && (
            <Card className="py-12 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto mb-3 h-8 w-8 opacity-30" />
              No notices found.
            </Card>
          )}
          {!loading && notices.map((n) => (
            <div
              key={n.id}
              onClick={() => setSelected(n.id === selected?.id ? null : n)}
              className={cn(
                "cursor-pointer rounded-lg border p-4 transition-colors",
                SEVERITY_STYLES[n.severity],
                n.id === selected?.id && "ring-1 ring-primary"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", SEVERITY_BADGE[n.severity])}>{n.severity}</span>
                    {n.status !== "UNREAD" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{n.status}</span>
                    )}
                  </div>
                  <div className="mt-1 font-medium text-sm">{n.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{formatDate(n.createdAt)}</div>
                </div>
                {canUpdate && (
                  <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                    {n.status === "UNREAD" && (
                      <button onClick={() => markRead(n)} className="p-1 text-muted-foreground hover:text-foreground" title="Mark read">
                        <CheckCheck className="h-4 w-4" />
                      </button>
                    )}
                    {n.status !== "ARCHIVED" && (
                      <button onClick={() => archiveNotice(n)} className="p-1 text-muted-foreground hover:text-foreground" title="Archive">
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
              <span>{total} notice{total !== 1 ? "s" : ""}</span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 px-3">Prev</Button>
                <span className="flex items-center">{page} / {totalPages}</span>
                <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 px-3">Next</Button>
              </div>
            </div>
          )}
        </div>

        {/* Detail */}
        {selected && (
          <div className="w-80 shrink-0">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", SEVERITY_BADGE[selected.severity])}>{selected.severity}</span>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <h3 className="mt-3 font-semibold">{selected.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{selected.content}</p>
              <dl className="mt-4 space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between"><dt>Status</dt><dd>{selected.status}</dd></div>
                <div className="flex justify-between"><dt>Created</dt><dd>{formatDate(selected.createdAt)}</dd></div>
                {selected.sourceType && <div className="flex justify-between"><dt>Source</dt><dd>{selected.sourceType}</dd></div>}
              </dl>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
