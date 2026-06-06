import { cn } from "@/lib/utils";
import { getAgentInitials, getAgentPortrait } from "@/lib/agentPortraits";
import type { AgentActivityStatus } from "@/types/api";

type AgentPortraitInput = {
  slug?: string | null;
  name?: string | null;
  title?: string | null;
};

type AgentPortraitProps = {
  agent?: AgentPortraitInput | null;
  size?: "sm" | "md" | "lg" | "xl";
  status?: AgentActivityStatus;
  showStatusRing?: boolean;
  className?: string;
};

const sizeClass = {
  sm: "h-12 w-12 rounded-xl",
  md: "h-16 w-16 rounded-xl",
  lg: "h-24 w-24 rounded-2xl",
  xl: "h-36 w-36 rounded-2xl"
};

const textSizeClass = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
  xl: "text-4xl"
};

const statusClass: Record<AgentActivityStatus, string> = {
  IDLE: "agent-status-idle",
  QUEUED: "agent-status-thinking",
  THINKING: "agent-status-thinking",
  WAITING_PROVIDER: "agent-status-waiting-provider",
  RESPONDING: "agent-status-responding",
  SUMMARIZING: "agent-status-responding",
  EXTRACTING_MEMORY: "agent-status-thinking",
  GENERATING_REPORT: "agent-status-responding",
  COMPLETED: "agent-status-completed",
  FAILED: "agent-status-failed"
};

const ringClass: Record<AgentActivityStatus, string> = {
  IDLE: "ring-border/70 shadow-[0_0_18px_rgba(214,170,87,0.08)]",
  QUEUED: "ring-primary/40 shadow-[0_0_20px_rgba(214,170,87,0.12)]",
  THINKING: "ring-primary/50 shadow-[0_0_24px_rgba(214,170,87,0.18)]",
  WAITING_PROVIDER: "ring-amber-400/50 shadow-[0_0_24px_rgba(251,191,36,0.14)]",
  RESPONDING: "ring-primary/60 shadow-[0_0_28px_rgba(214,170,87,0.22)]",
  SUMMARIZING: "ring-primary/60 shadow-[0_0_28px_rgba(214,170,87,0.22)]",
  EXTRACTING_MEMORY: "ring-blue-400/45 shadow-[0_0_24px_rgba(96,165,250,0.14)]",
  GENERATING_REPORT: "ring-primary/60 shadow-[0_0_28px_rgba(214,170,87,0.22)]",
  COMPLETED: "ring-emerald-400/45 shadow-[0_0_22px_rgba(52,211,153,0.14)]",
  FAILED: "ring-destructive/60 shadow-[0_0_22px_rgba(239,68,68,0.16)]"
};

const statusLabel: Record<AgentActivityStatus, string> = {
  IDLE: "Idle",
  QUEUED: "Queued",
  THINKING: "Thinking",
  WAITING_PROVIDER: "Waiting for provider",
  RESPONDING: "Responding",
  SUMMARIZING: "Summarizing",
  EXTRACTING_MEMORY: "Extracting memory",
  GENERATING_REPORT: "Generating report",
  COMPLETED: "Completed",
  FAILED: "Failed"
};

export function AgentPortrait({
  agent,
  size = "md",
  status = "IDLE",
  showStatusRing = true,
  className
}: AgentPortraitProps) {
  const portrait = getAgentPortrait(agent);
  const initials = getAgentInitials(agent);
  const alt = `${agent?.name ?? agent?.title ?? "AI agent"}${agent?.title ? `, ${agent.title}` : ""} portrait`;
  const label = statusLabel[status];

  return (
    <div
      role={portrait ? undefined : "img"}
      aria-label={portrait ? undefined : alt}
      title={`${alt}. Status: ${label}`}
      className={cn(
        "group/portrait relative shrink-0 overflow-hidden border border-primary/30 bg-card/70",
        "before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/10 before:via-transparent before:to-background/35 before:pointer-events-none",
        sizeClass[size],
        showStatusRing && "ring-1",
        showStatusRing && ringClass[status],
        statusClass[status],
        className
      )}
    >
      {portrait ? (
        <img
          src={portrait}
          alt={alt}
          className="h-full w-full object-cover contrast-[1.04] saturate-[1.08]"
          loading="lazy"
        />
      ) : (
        <div className={cn("flex h-full w-full items-center justify-center bg-primary/10 font-display font-bold text-primary", textSizeClass[size])}>
          {initials}
        </div>
      )}
      {showStatusRing && <span className="sr-only">Status: {label}</span>}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_28px_rgba(0,0,0,0.38)]" />
    </div>
  );
}
