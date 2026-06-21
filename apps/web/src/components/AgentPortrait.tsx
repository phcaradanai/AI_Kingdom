import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAgentDisplayName, getAgentDisplayTitle, getAgentInitials, getAgentPortrait, type AgentPortraitInput } from "@/lib/agentPortraits";
import type { AgentActivityStatus } from "@/types/api";

type AgentPortraitProps = {
  agent?: AgentPortraitInput | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  shape?: "rounded" | "square" | "portrait-card";
  objectFit?: "cover" | "contain";
  status?: AgentActivityStatus;
  showStatusRing?: boolean;
  clickToView?: boolean;
  className?: string;
};

// Dimensions for square sizes
const sizeBaseClass: Record<NonNullable<AgentPortraitProps["size"]>, string> = {
  xs: "h-8 w-8",
  sm: "h-12 w-12",
  md: "h-[72px] w-[72px]",
  lg: "h-28 w-28",
  xl: "h-40 w-40",
  hero: "h-60 w-60 max-w-full",
};

// Width only — used for portrait-card which derives height from aspect ratio
const sizeWidthClass: Record<NonNullable<AgentPortraitProps["size"]>, string> = {
  xs: "w-8",
  sm: "w-12",
  md: "w-[72px]",
  lg: "w-28",
  xl: "w-40",
  hero: "w-60 max-w-full",
};

const sizeRadiusClass: Record<NonNullable<AgentPortraitProps["size"]>, string> = {
  xs: "rounded-lg",
  sm: "rounded-xl",
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-2xl",
  hero: "rounded-2xl",
};

const textSizeClass: Record<NonNullable<AgentPortraitProps["size"]>, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
  xl: "text-4xl",
  hero: "text-6xl",
};

const ringWidthClass: Record<NonNullable<AgentPortraitProps["size"]>, string> = {
  xs: "ring-1",
  sm: "ring-1",
  md: "ring-1",
  lg: "ring-2",
  xl: "ring-2",
  hero: "ring-2",
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
  FAILED: "agent-status-failed",
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
  FAILED: "ring-destructive/60 shadow-[0_0_22px_rgba(239,68,68,0.16)]",
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
  FAILED: "Failed",
};

function PortraitModal({
  src,
  alt,
  name,
  title,
  onClose,
}: {
  src: string;
  alt: string;
  name?: string | null;
  title?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Full portrait: ${alt}`}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <button
          className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg hover:bg-muted"
          onClick={onClose}
          aria-label="Close portrait"
        >
          <X className="h-4 w-4" />
        </button>
        <img
          src={src}
          alt={alt}
          className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain shadow-2xl"
        />
        {(name || title) && (
          <div className="mt-3 text-center">
            {title && <div className="font-display text-base font-semibold text-foreground">{title}</div>}
            {name && <div className="text-sm text-muted-foreground">{name}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentPortrait({
  agent,
  size = "md",
  shape = "rounded",
  objectFit = "cover",
  status = "IDLE",
  showStatusRing = true,
  clickToView = false,
  className,
}: AgentPortraitProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const portrait = getAgentPortrait(agent);
  const initials = getAgentInitials(agent);
  const displayName = getAgentDisplayName(agent);
  const displayTitle = getAgentDisplayTitle(agent);
  const alt = `${displayName}${displayTitle ? `, ${displayTitle}` : ""} portrait`;
  const label = statusLabel[status];

  const radius = shape === "square" ? "rounded-none" : sizeRadiusClass[size];

  const dimensionClass =
    shape === "portrait-card"
      ? cn(sizeWidthClass[size], "h-auto aspect-[4/5]")
      : sizeBaseClass[size];

  const containerClass = cn(
    "group/portrait relative shrink-0 overflow-hidden border border-primary/30 bg-card/70",
    "before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/10 before:via-transparent before:to-background/35 before:pointer-events-none",
    dimensionClass,
    radius,
    showStatusRing && ringWidthClass[size],
    showStatusRing && ringClass[status],
    statusClass[status],
    clickToView && portrait && "cursor-pointer",
    className
  );

  return (
    <>
      <div
        role={portrait ? undefined : "img"}
        aria-label={portrait ? undefined : alt}
        title={`${alt}. Status: ${label}`}
        className={containerClass}
        onClick={clickToView && portrait ? () => setModalOpen(true) : undefined}
      >
        {portrait ? (
          <img
            src={portrait}
            alt={alt}
            className={cn(
              "h-full w-full contrast-[1.04] saturate-[1.08]",
              objectFit === "contain" ? "object-contain" : "object-cover",
              shape === "portrait-card" && "object-top"
            )}
            loading="lazy"
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center bg-primary/10 font-display font-bold text-primary",
              textSizeClass[size]
            )}
          >
            {initials}
          </div>
        )}
        {showStatusRing && <span className="sr-only">Status: {label}</span>}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_28px_rgba(0,0,0,0.38)]"
        />
      </div>
      {modalOpen && portrait && (
        <PortraitModal
          src={portrait}
          alt={alt}
          name={displayName}
          title={displayTitle}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
