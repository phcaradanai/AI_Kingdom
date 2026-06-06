import { AlertTriangle, Archive, CheckCircle2, ClipboardList, FolderKanban, Inbox, Landmark, Scroll, ScrollText, Shield, Vault, ArrowRight, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AgentPortrait } from "@/components/AgentPortrait";
import { PageHeader } from "@/components/PageHeader";
import { TaskCard } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { HandoffBriefDto, ProjectDto, ProjectInboxItemDto, SecretaryBriefDto, WorkOrderDto } from "@/types/api";

const SEVERITY_COLORS = {
  critical: "text-destructive bg-destructive/10 border-destructive/30",
  warning: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  info: "text-blue-400 bg-blue-500/10 border-blue-500/30"
};

const SEVERITY_ICONS = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: CheckCircle2
};

export function DashboardPage() {
  const { agents, tasks, reports, memories } = useKingdomStore();
  const user = useAuthStore((state) => state.user);
  const canCommand = user?.role === "KING" || user?.role === "CROWN_PRINCE" || user?.role === "MINISTER";
  
  const [brief, setBrief] = useState<SecretaryBriefDto | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderDto[]>([]);
  const [handoffBriefs, setHandoffBriefs] = useState<HandoffBriefDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectInbox, setProjectInbox] = useState<ProjectInboxItemDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.secretaryBrief().catch(() => null),
      api.workOrders().catch(() => ({ workOrders: [] })),
      api.handoffBriefs().catch(() => ({ handoffBriefs: [] })),
      api.projects().catch(() => ({ projects: [] })),
      api.projectInbox({ status: "PENDING" }).catch(() => ({ inboxItems: [] }))
    ])
      .then(([briefRes, ordersRes, handoffsRes, projectsRes, inboxRes]) => {
        if (briefRes) setBrief(briefRes);
        setWorkOrders(ordersRes.workOrders);
        setHandoffBriefs(handoffsRes.handoffBriefs);
        setProjects(projectsRes.projects);
        setProjectInbox(inboxRes.inboxItems);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const stats = [
    { label: "Royal Agents", value: agents.length, icon: Shield },
    { label: "Commands", value: tasks.length, icon: Landmark },
    { label: "Reports", value: reports.length, icon: ScrollText },
    { label: "Memories", value: memories.length, icon: Vault }
  ];

  if (isLoading) {
    return <LoadingState message="Summoning royal briefings..." className="min-h-[60vh]" />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow="Morning Briefing"
        title="The Kingdom at a glance"
        description="Monitor agents, council deliberations, generated reports, and institutional memory from your command center."
      />

      {/* Issue Royal Decree CTA */}
      {canCommand && (
        <div>
          <Link to="/throne-room">
            <div className="group relative flex items-center gap-5 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-transparent px-6 py-5 transition-all duration-300 hover:border-primary/60 hover:shadow-[0_0_30px_rgba(214,170,87,0.15)] overflow-hidden">
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay pointer-events-none"></div>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-primary/20 transition-transform duration-500 group-hover:scale-105 group-hover:bg-primary/30 shadow-[0_0_15px_rgba(214,170,87,0.2)]">
                <Scroll className="h-7 w-7 text-primary drop-shadow-[0_0_5px_rgba(214,170,87,0.5)]" />
              </div>
              <div className="flex-1">
                <div className="font-display text-xl font-bold tracking-wide text-primary">Issue Royal Decree</div>
                <div className="mt-1 text-sm text-primary/70">Open the Throne Room and command the royal council</div>
              </div>
              <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary opacity-60 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-1 group-hover:bg-primary/20">
                <ArrowRight className="h-5 w-5" />
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            title={stat.label}
            value={stat.value}
            icon={stat.icon}
          />
        ))}
      </div>

      {agents.length > 0 && (
        <SectionCard
          title="Royal Council"
          icon={Shield}
          action={<Link to="/agents" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">Manage Agents</Link>}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {agents.slice(0, 5).map((agent) => (
              <div key={agent.id} className="rounded-xl border border-primary/20 bg-muted/20 p-3">
                <div className="flex items-center gap-3">
                  <AgentPortrait agent={agent} size="md" status="IDLE" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{agent.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{agent.title}</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-primary/70">Idle</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Royal Secretary Brief */}
      {brief && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Kingdom Status */}
            <SectionCard title="Kingdom Status" icon={Shield} action={<span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Royal Secretary</span>}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatCard className="bg-transparent border-none p-0" title="Unread Notices" value={brief.kingdomStatus.unreadNotices} />
                <StatCard className="bg-transparent border-none p-0" title="Critical Notices" value={brief.kingdomStatus.criticalNotices} trend={brief.kingdomStatus.criticalNotices > 0 ? { value: "Action Required", isPositive: false } : undefined} />
                <StatCard className="bg-transparent border-none p-0" title="Open Matters" value={brief.kingdomStatus.openMatters} />
                <StatCard className="bg-transparent border-none p-0" title="Critical Matters" value={brief.kingdomStatus.criticalMatters} trend={brief.kingdomStatus.criticalMatters > 0 ? { value: "Action Required", isPositive: false } : undefined} />
                <StatCard className="bg-transparent border-none p-0" title="Awaiting Decision" value={brief.kingdomStatus.awaitingRoyalDecision} trend={brief.kingdomStatus.awaitingRoyalDecision > 0 ? { value: "Pending", isPositive: false } : undefined} />
                <StatCard className="bg-transparent border-none p-0" title="Failed Decrees" value={brief.kingdomStatus.failedTasks} trend={brief.kingdomStatus.failedTasks > 0 ? { value: "Requires Review", isPositive: false } : undefined} />
              </div>
            </SectionCard>

            {/* Recommended Actions */}
            <SectionCard title="Recommended Actions" icon={Landmark}>
              {brief.recommendedActions.length > 0 ? (
                <div className="space-y-3">
                  {brief.recommendedActions.map((action, i) => {
                    const colors = SEVERITY_COLORS[action.severity];
                    const Icon = SEVERITY_ICONS[action.severity];
                    const inner = (
                      <div className={cn("flex items-center gap-4 rounded-xl border px-4 py-3 text-sm transition-colors hover:bg-opacity-80", colors)}>
                        <div className="p-1.5 rounded-md bg-background/20"><Icon className="h-4 w-4 shrink-0" /></div>
                        <span className="font-medium tracking-wide">{action.action}</span>
                      </div>
                    );
                    return action.href ? (
                      <Link key={i} to={action.href} className="block transition-transform hover:-translate-y-0.5">{inner}</Link>
                    ) : (
                      <div key={i}>{inner}</div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No Urgent Actions" description="The kingdom is currently stable." />
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            {/* Urgent Notices */}
            <SectionCard title="Urgent Notices" icon={AlertTriangle} action={<Link to="/notices" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">View All</Link>}>
              {brief.urgentNotices.length > 0 ? (
                <div className="space-y-3">
                  {brief.urgentNotices.map((n) => (
                    <div key={n.id} className={cn("flex flex-col gap-1.5 rounded-lg border px-4 py-3", n.severity === "CRITICAL" ? "border-destructive/30 bg-destructive/10" : "border-amber-500/30 bg-amber-500/10")}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{n.title}</div>
                        <StatusBadge type={n.severity === "CRITICAL" ? "error" : "warning"} status={n.severity} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(n.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No Urgent Notices" description="All clear on the horizon." />
              )}
            </SectionCard>

            {/* Awaiting Royal Decision */}
            <SectionCard title="Awaiting Royal Decision" icon={Scroll} action={<Link to="/matters" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">View All</Link>}>
              {brief.awaitingRoyalDecision.length > 0 ? (
                <div className="space-y-3">
                  {brief.awaitingRoyalDecision.map((m) => (
                    <div key={m.id} className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{m.title}</div>
                        <PriorityBadge priority={m.priority} />
                      </div>
                      <div className="mt-1.5 text-xs text-muted-foreground uppercase tracking-widest font-semibold">{m.category}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No Pending Decisions" description="Your desk is clear." />
              )}
            </SectionCard>
          </div>

          {/* Charter mission reminder */}
          {brief.charter && (
            <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-6 backdrop-blur-sm shadow-[0_0_20px_rgba(214,170,87,0.05)]">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Shield className="h-24 w-24 text-primary" />
              </div>
              <div className="relative z-10 flex flex-col gap-2">
                <span className="font-bold text-primary text-xs uppercase tracking-[0.3em]">Prime Directive</span>
                <p className="text-sm font-medium leading-relaxed text-foreground/90 max-w-3xl">
                  {brief.charter.mission}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Projects */}
        <SectionCard 
          title="Project Overview" 
          icon={FolderKanban}
          action={
            <Link to="/projects">
              <Button variant="outline" className="h-8 text-xs">Open Projects</Button>
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <StatCard className="bg-transparent border-none p-0" title="Active Projects" value={projects.filter((project) => project.status === "ACTIVE").length} />
            <StatCard className="bg-transparent border-none p-0" title="Inbox Items" value={projectInbox.length} trend={projectInbox.length > 0 ? { value: "Review Needed", isPositive: false } : undefined} />
            <StatCard className="bg-transparent border-none p-0" title="Critical Matters" value={brief?.kingdomStatus.criticalMatters ?? 0} trend={(brief?.kingdomStatus.criticalMatters ?? 0) > 0 ? { value: "Action Required", isPositive: false } : undefined} />
          </div>
          
          {projects.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 mb-6">
              {projects.slice(0, 4).map((project) => (
                <Link key={project.id} to={`/projects/${project.id}`} className="group rounded-lg border border-border bg-muted/20 p-4 transition-all hover:border-primary/50 hover:bg-muted/40 hover:shadow-sm">
                  <div className="flex justify-between items-start">
                    <div className="font-semibold group-hover:text-primary transition-colors">{project.name}</div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground line-clamp-1">{project.activeMilestone || project.priority}</div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState className="mb-6 py-8" title="No Active Projects" description="Start a new initiative for the kingdom." />
          )}

          <div className="flex flex-wrap gap-3">
            <Link to="/project-inbox"><Button variant="secondary" className="h-9"><Inbox className="h-4 w-4 mr-2" />Project Inbox</Button></Link>
            <Link to="/artifacts"><Button variant="secondary" className="h-9"><Archive className="h-4 w-4 mr-2" />Artifacts</Button></Link>
          </div>
        </SectionCard>

        {/* External Work */}
        <SectionCard 
          title="External Work" 
          icon={ClipboardList}
          action={
            <Link to="/work-orders">
              <Button variant="outline" className="h-8 text-xs">Open Work Orders</Button>
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <StatCard className="bg-transparent border-none p-0" title="Open Orders" value={workOrders.filter((order) => ["DRAFT", "READY"].includes(order.status)).length} />
            <StatCard className="bg-transparent border-none p-0" title="In Progress" value={workOrders.filter((order) => order.status === "IN_PROGRESS").length} />
            <StatCard className="bg-transparent border-none p-0" title="Needs Review" value={workOrders.filter((order) => order.status === "NEEDS_REVIEW").length} trend={workOrders.filter((order) => order.status === "NEEDS_REVIEW").length > 0 ? { value: "Review", isPositive: false } : undefined} />
          </div>

          {handoffBriefs[0] ? (
            <div className="mb-6 rounded-lg border border-border bg-muted/20 p-4">
              <div className="font-semibold tracking-wide text-foreground">{handoffBriefs[0].title}</div>
              <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">{handoffBriefs[0].handoffPrompt}</div>
            </div>
          ) : (
             <EmptyState className="mb-6 py-8" title="No Handoff Briefs" description="No recent external operations." />
          )}

          <div className="flex flex-wrap gap-3">
            <Link to="/work-orders"><Button variant="secondary" className="h-9">Review Work Orders</Button></Link>
            <Link to="/work-orders"><Button variant="secondary" className="h-9">Review Handoffs</Button></Link>
          </div>
        </SectionCard>
      </div>

      {/* Recent decrees */}
      {tasks.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl tracking-wide">Recent Decrees</h2>
            <Link to="/throne-room" className="text-sm font-semibold uppercase tracking-wider text-primary hover:underline">View All</Link>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {tasks.slice(0, 4).map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
