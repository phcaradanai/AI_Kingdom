import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { AuditLogDto } from "@/types/api";

const ACTION_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  create_user: "Create User",
  update_user: "Update User",
  delete_user: "Delete User",
  create_agent: "Create Agent",
  update_agent: "Update Agent",
  delete_agent: "Delete Agent",
  update_setting: "Update Setting",
  delete_memory: "Delete Memory"
};

const RESOURCE_TYPES = ["", "auth", "user", "agent", "setting", "memory"];
const ACTIONS = ["", ...Object.keys(ACTION_LABELS)];

type Filters = {
  q: string;
  action: string;
  resourceType: string;
  startDate: string;
  endDate: string;
};

const EMPTY_FILTERS: Filters = { q: "", action: "", resourceType: "", startDate: "", endDate: "" };
const PAGE_SIZE = 25;

export function AuditPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [pending, setPending] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AuditLogDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      try {
        let result;
        if (filters.q) {
          result = await api.auditSearch(filters.q, { page, limit: PAGE_SIZE });
        } else {
          result = await api.auditLogs({
            page,
            limit: PAGE_SIZE,
            action: filters.action || undefined,
            resourceType: filters.resourceType || undefined,
            startDate: filters.startDate || undefined,
            endDate: filters.endDate || undefined
          });
        }
        if (!cancelled) {
          setLogs(result.logs);
          setTotal(result.total);
        }
      } catch {
        if (!cancelled) setLogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [filters, page]);

  function applyFilters() {
    setFilters(pending);
    setPage(1);
    setSelected(null);
  }

  function clearFilters() {
    setPending(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
    setSelected(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader eyebrow="Administration" title="Audit Log" description="Security events and administrative actions." />

      {/* Filters */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search events…"
              value={pending.q}
              onChange={(e) => setPending((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            value={pending.action}
            onChange={(e) => setPending((f) => ({ ...f, action: e.target.value }))}
          >
            <option value="">All actions</option>
            {ACTIONS.filter(Boolean).map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            value={pending.resourceType}
            onChange={(e) => setPending((f) => ({ ...f, resourceType: e.target.value }))}
          >
            <option value="">All resources</option>
            {RESOURCE_TYPES.filter(Boolean).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <Input
            type="date"
            className="w-36"
            value={pending.startDate}
            onChange={(e) => setPending((f) => ({ ...f, startDate: e.target.value }))}
          />
          <Input
            type="date"
            className="w-36"
            value={pending.endDate}
            onChange={(e) => setPending((f) => ({ ...f, endDate: e.target.value }))}
          />
          <Button onClick={applyFilters}>Apply</Button>
          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </Card>

      <div className="flex gap-4">
        {/* Log table */}
        <div className="min-w-0 flex-1">
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Timestamp</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actor</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Resource</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading…</td>
                  </tr>
                )}
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No audit events found.</td>
                  </tr>
                )}
                {!loading && logs.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setSelected(entry.id === selected?.id ? null : entry)}
                    className={cn(
                      "cursor-pointer border-b border-border/50 transition-colors last:border-0",
                      entry.id === selected?.id ? "bg-primary/10" : "hover:bg-muted/50"
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{entry.user?.displayName ?? "System"}</div>
                      <div className="text-xs text-muted-foreground">{entry.user?.email ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{entry.resourceType}</span>
                      {entry.resourceId && (
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground/60 truncate max-w-[120px]">
                          {entry.resourceId}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} event{total !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 w-8 p-0">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>Page {page} of {totalPages}</span>
              <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 w-8 p-0">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 shrink-0">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Event Detail</h3>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <DetailRow label="Timestamp" value={new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(selected.createdAt))} />
                <DetailRow label="Actor" value={selected.user?.displayName ?? "System"} />
                <DetailRow label="Email" value={selected.user?.email ?? "—"} />
                <DetailRow label="Role" value={selected.user?.role?.replace("_", " ") ?? "—"} />
                <DetailRow label="Action" value={ACTION_LABELS[selected.action] ?? selected.action} />
                <DetailRow label="Resource" value={selected.resourceType} />
                {selected.resourceId && <DetailRow label="Resource ID" mono value={selected.resourceId} />}
              </dl>
              {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                <div className="mt-4">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Metadata</div>
                  <pre className="overflow-auto rounded border border-border bg-muted/40 p-3 text-xs leading-relaxed">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    login: "bg-green-500/15 text-green-400",
    logout: "bg-blue-500/15 text-blue-400",
    create_user: "bg-purple-500/15 text-purple-400",
    update_user: "bg-yellow-500/15 text-yellow-400",
    delete_user: "bg-red-500/15 text-red-400",
    create_agent: "bg-purple-500/15 text-purple-400",
    update_agent: "bg-yellow-500/15 text-yellow-400",
    delete_agent: "bg-red-500/15 text-red-400",
    update_setting: "bg-orange-500/15 text-orange-400",
    delete_memory: "bg-red-500/15 text-red-400"
  };
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", colors[action] ?? "bg-muted text-muted-foreground")}>
      {ACTION_LABELS[action] ?? action}
    </span>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/50 pb-3 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("break-all", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}
