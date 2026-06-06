import { AlertTriangle, Archive, CheckCircle2, ClipboardList, FolderKanban, Inbox, Landmark, Scroll, ScrollText, Shield, Vault } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { TaskCard } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { HandoffBriefDto, ProjectDto, ProjectInboxItemDto, SecretaryBriefDto, WorkOrderDto } from "@/types/api";

const SEVERITY_COLORS = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  warning: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  info: "text-blue-400 bg-blue-500/10 border-blue-500/30"
};

const SEVERITY_ICONS = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: CheckCircle2
};

function StatusPill({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3 text-center", warn && value > 0 ? "border-red-500/40 bg-red-500/10" : "border-border bg-muted/40")}>
      <div className={cn("text-2xl font-bold tabular-nums", warn && value > 0 ? "text-red-400" : "text-foreground")}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function DashboardPage() {
  const { agents, tasks, reports, memories } = useKingdomStore();
  const user = useAuthStore((state) => state.user);
  const canCommand = user?.role === "KING" || user?.role === "CROWN_PRINCE" || user?.role === "MINISTER";
  const [brief, setBrief] = useState<SecretaryBriefDto | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderDto[]>([]);
  const [handoffBriefs, setHandoffBriefs] = useState<HandoffBriefDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectInbox, setProjectInbox] = useState<ProjectInboxItemDto[]>([]);

  useEffect(() => {
    api.secretaryBrief().then(setBrief).catch(() => undefined);
    Promise.all([api.workOrders(), api.handoffBriefs(), api.projects(), api.projectInbox({ status: "PENDING" })])
      .then(([orders, handoffs, projectResponse, inboxResponse]) => {
        setWorkOrders(orders.workOrders);
        setHandoffBriefs(handoffs.handoffBriefs);
        setProjects(projectResponse.projects);
        setProjectInbox(inboxResponse.inboxItems);
      })
      .catch(() => undefined);
  }, []);

  const stats = [
    { label: "Royal Agents", value: agents.length, icon: Shield },
    { label: "Commands", value: tasks.length, icon: Landmark },
    { label: "Reports", value: reports.length, icon: ScrollText },
    { label: "Memories", value: memories.length, icon: Vault }
  ];

  return (
    <>
      <PageHeader
        eyebrow="Royal Overview"
        title="The Kingdom at a glance"
        description="Monitor agents, council deliberations, generated reports, and institutional memory from one command center."
      />

      {/* Issue Royal Decree CTA */}
      {canCommand && (
        <div className="mb-6">
          <Link to="/throne-room">
            <div className="group flex items-center gap-4 rounded-xl border border-primary/40 bg-primary/8 px-6 py-4 transition hover:border-primary/70 hover:bg-primary/15">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/15 transition group-hover:bg-primary/25">
                <Scroll className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-display text-base text-primary">Issue Royal Decree</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Open the Throne Room and command the royal council</div>
              </div>
              <div className="shrink-0 text-xs font-semibold text-primary opacity-60 group-hover:opacity-100">→</div>
            </div>
          </Link>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <stat.icon className="h-5 w-5 text-primary" />
            <div className="mt-4 text-3xl font-bold">{stat.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
          </Card>
        ))}
      </div>

      {/* Royal Secretary Brief */}
      {brief && (
        <div className="mt-6 space-y-4">
          {/* Kingdom Status */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg">Kingdom Status</h2>
              <span className="text-xs text-muted-foreground">Royal Secretary</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <StatusPill value={brief.kingdomStatus.unreadNotices} label="Unread Notices" />
              <StatusPill value={brief.kingdomStatus.criticalNotices} label="Critical Notices" warn />
              <StatusPill value={brief.kingdomStatus.openMatters} label="Open Matters" />
              <StatusPill value={brief.kingdomStatus.criticalMatters} label="Critical Matters" warn />
              <StatusPill value={brief.kingdomStatus.awaitingRoyalDecision} label="Awaiting Decision" warn />
              <StatusPill value={brief.kingdomStatus.failedTasks} label="Failed Decrees" warn />
            </div>
          </Card>

          {/* Recommended Actions */}
          <Card>
            <h2 className="mb-4 font-display text-lg">Recommended Actions</h2>
            <div className="space-y-2">
              {brief.recommendedActions.map((action, i) => {
                const colors = SEVERITY_COLORS[action.severity];
                const Icon = SEVERITY_ICONS[action.severity];
                const inner = (
                  <div className={cn("flex items-center gap-3 rounded-lg border px-4 py-3 text-sm", colors)}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{action.action}</span>
                  </div>
                );
                return action.href ? (
                  <Link key={i} to={action.href}>{inner}</Link>
                ) : (
                  <div key={i}>{inner}</div>
                );
              })}
            </div>
          </Card>

          {/* Urgent Notices + Open Matters side by side */}
          <div className="grid gap-4 xl:grid-cols-2">
            {brief.urgentNotices.length > 0 && (
              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-base">Urgent Notices</h2>
                  <Link to="/notices" className="text-xs text-primary hover:underline">View all</Link>
                </div>
                <div className="space-y-2">
                  {brief.urgentNotices.map((n) => (
                    <div key={n.id} className={cn("rounded-md border px-3 py-2 text-xs", n.severity === "CRITICAL" ? "border-red-500/30 bg-red-500/10" : "border-yellow-500/30 bg-yellow-500/10")}>
                      <div className="font-medium">{n.title}</div>
                      <div className="mt-0.5 text-muted-foreground">{formatDate(n.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {brief.awaitingRoyalDecision.length > 0 && (
              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-base">Awaiting Royal Decision</h2>
                  <Link to="/matters" className="text-xs text-primary hover:underline">View all</Link>
                </div>
                <div className="space-y-2">
                  {brief.awaitingRoyalDecision.map((m) => (
                    <div key={m.id} className="rounded-md border border-border px-3 py-2 text-xs">
                      <div className="font-medium">{m.title}</div>
                      <div className="mt-0.5 text-muted-foreground">{m.category} · {m.priority}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Charter mission reminder */}
          {brief.charter && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 text-sm text-muted-foreground">
              <span className="font-semibold text-primary/70 text-xs uppercase tracking-widest">Prime Directive · </span>
              {brief.charter.mission}
            </div>
          )}
        </div>
      )}

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">Project Overview</h2>
            <p className="mt-1 text-xs text-muted-foreground">Workspace routing health and active kingdom initiatives.</p>
          </div>
          <Link to="/projects">
            <Button variant="outline">
              <FolderKanban className="h-4 w-4" />
              Create Project
            </Button>
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatusPill value={projects.filter((project) => project.status === "ACTIVE").length} label="Active Projects" />
          <StatusPill value={projectInbox.length} label="Inbox Items" warn />
          <StatusPill value={brief?.kingdomStatus.criticalMatters ?? 0} label="Critical Matters" warn />
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {projects.slice(0, 3).map((project) => (
            <Link key={project.id} to={`/projects/${project.id}`} className="rounded-md border border-border bg-muted/30 p-3 text-sm transition hover:border-primary/50">
              <div className="font-medium">{project.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{project.activeMilestone || project.priority}</div>
            </Link>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/project-inbox"><Button variant="outline"><Inbox className="h-4 w-4" />Review Project Inbox</Button></Link>
          <Link to="/artifacts"><Button variant="outline"><Archive className="h-4 w-4" />Create Artifact</Button></Link>
        </div>
      </Card>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">External Work</h2>
            <p className="mt-1 text-xs text-muted-foreground">Manual handoff work orders and latest execution transfer notes.</p>
          </div>
          <Link to="/work-orders">
            <Button variant="outline">
              <ClipboardList className="h-4 w-4" />
              Create Work Order
            </Button>
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatusPill value={workOrders.filter((order) => ["DRAFT", "READY"].includes(order.status)).length} label="Open Work Orders" />
          <StatusPill value={workOrders.filter((order) => order.status === "IN_PROGRESS").length} label="In Progress" />
          <StatusPill value={workOrders.filter((order) => order.status === "NEEDS_REVIEW").length} label="Needs Review" warn />
        </div>
        {handoffBriefs[0] ? (
          <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="font-medium">{handoffBriefs[0].title}</div>
            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{handoffBriefs[0].handoffPrompt}</div>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/work-orders"><Button variant="outline">Generate from latest Matter</Button></Link>
          <Link to="/work-orders"><Button variant="outline">Generate Handoff Brief</Button></Link>
        </div>
      </Card>

      {/* Recent decrees */}
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {tasks.slice(0, 4).map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </>
  );
}
