import { useEffect, useMemo, useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { ProjectDto, ProjectInboxItemDto, ProjectInboxStatus } from "@/types/api";

const statuses: ProjectInboxStatus[] = ["PENDING", "ASSIGNED", "DISMISSED"];

export function ProjectInboxPage() {
  const user = useAuthStore((state) => state.user);
  const canAssign = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [items, setItems] = useState<ProjectInboxItemDto[]>([]);
  const [status, setStatus] = useState<ProjectInboxStatus | "">("PENDING");
  const [selection, setSelection] = useState<Record<string, string>>({});

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  async function load() {
    const [projectResponse, inboxResponse] = await Promise.all([
      api.projects(),
      api.projectInbox({ status: status || undefined })
    ]);
    setProjects(projectResponse.projects);
    setItems(inboxResponse.inboxItems);
  }

  useEffect(() => {
    void load();
  }, [status]);

  async function assign(item: ProjectInboxItemDto) {
    const projectId = selection[item.id] || item.candidateProjectIds[0];
    if (!projectId) return;
    await api.assignProjectInboxItem(item.id, projectId);
    await load();
  }

  async function dismiss(item: ProjectInboxItemDto) {
    await api.dismissProjectInboxItem(item.id);
    await load();
  }

  return (
    <>
      <PageHeader
        eyebrow="Royal Secretary"
        title="Project Inbox"
        description="Review low-confidence project routing decisions before they become official kingdom context."
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg">Inbox Items</h2>
          <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as ProjectInboxStatus | "")}>
            <option value="">All statuses</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </Card>

      <div className="mt-5 space-y-4">
        {items.map((item) => {
          const candidates = item.candidateProjectIds.map((id) => projectById.get(id)).filter(Boolean) as ProjectDto[];
          return (
            <Card key={item.id} className={cn(item.status === "PENDING" && "border-primary/40")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-primary" />
                    <h2 className="font-display text-lg">{item.title}</h2>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                </div>
                <div className="rounded-full border border-border px-2 py-1 text-xs">{item.status}</div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px]">
                <div className="space-y-2 text-sm">
                  <div className="text-muted-foreground">Source: {item.sourceType} / {item.sourceId}</div>
                  <div className="text-muted-foreground">Confidence: {item.confidenceScore ?? 0}%</div>
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-muted-foreground">{item.reason || "No routing reason recorded."}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</div>
                </div>
                <div className="space-y-3">
                  <select
                    disabled={!canAssign || item.status !== "PENDING"}
                    className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm"
                    value={selection[item.id] ?? candidates[0]?.id ?? ""}
                    onChange={(e) => setSelection({ ...selection, [item.id]: e.target.value })}
                  >
                    <option value="">Select project</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <Button disabled={!canAssign || item.status !== "PENDING"} onClick={() => void assign(item)}><Check className="h-4 w-4" />Assign</Button>
                    <Button disabled={!canAssign || item.status !== "PENDING"} variant="outline" onClick={() => void dismiss(item)}><X className="h-4 w-4" />Dismiss</Button>
                  </div>
                  {candidates.length ? (
                    <div className="text-xs text-muted-foreground">
                      Suggested: {candidates.map((project) => project.name).join(", ")}
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
        {items.length === 0 ? <Card>No inbox items match this filter.</Card> : null}
      </div>
    </>
  );
}
