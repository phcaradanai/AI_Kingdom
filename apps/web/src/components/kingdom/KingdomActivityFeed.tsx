import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { ProvenanceLinks, provenanceFromActivity } from "@/components/ProvenanceLinks";
import { cn } from "@/lib/utils";
import type { KingdomActivityItemDto, KingdomActivityType } from "@/types/api";

export const ACTIVITY_TYPE_COLORS: Record<KingdomActivityType, string> = {
  COUNCIL: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  WORK_ORDER: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  AUTOMATION_JOB: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  RUNNER_EVENT: "border-indigo-500/40 bg-indigo-500/10 text-indigo-400",
  REVIEW: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  KNOWLEDGE: "border-primary/40 bg-primary/10 text-primary"
};

const ACTIVITY_TYPE_LABELS: Record<KingdomActivityType, string> = {
  COUNCIL: "Council",
  WORK_ORDER: "Work order",
  AUTOMATION_JOB: "Automation job",
  RUNNER_EVENT: "Runner event",
  REVIEW: "Review",
  KNOWLEDGE: "Knowledge"
};

export function ActivityRow({ item }: { item: KingdomActivityItemDto }) {
  const typeColor = ACTIVITY_TYPE_COLORS[item.type] ?? "border-border bg-muted/20 text-muted-foreground";
  const typeLabel = ACTIVITY_TYPE_LABELS[item.type];
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/30 bg-card/40 px-3 py-2.5 transition-colors hover:bg-card/70">
      <div title={`Activity type: ${item.type}`} className={cn("mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", typeColor)}>
        {typeLabel}
      </div>
      <div className="min-w-0 flex-1">
        <Link to={item.sourceReference.routeTo} className="group flex items-start gap-2 text-xs leading-snug text-foreground/90 hover:text-primary">
          <span className="min-w-0 flex-1">{item.summary}</span>
          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
        </Link>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
          <span className="font-semibold text-foreground/75">Why am I seeing this?</span> Recent {typeLabel.toLowerCase()} activity was observed in a source record.
        </p>
        <ProvenanceLinks className="mt-2" {...provenanceFromActivity(item)} />
      </div>
    </div>
  );
}

/**
 * Recent Kingdom activity from agents, runner, external agents, and kingdom systems.
 * Every row links back to its source entity (provenance). Shared by the Dashboard and the
 * Kingdom Operations Center.
 */
export function KingdomActivityFeed({ activities, limit = 30 }: { activities: KingdomActivityItemDto[]; limit?: number }) {
  if (activities.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No recent activity.</p>;
  }
  return (
    <div className="space-y-2">
      {activities.slice(0, limit).map((item) => (
        <ActivityRow key={item.id} item={item} />
      ))}
    </div>
  );
}
