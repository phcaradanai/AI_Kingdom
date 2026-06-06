import { cn } from "@/lib/utils";

interface PriorityBadgeProps {
  priority: string;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const p = priority.toUpperCase();
  
  let variant = "bg-muted text-muted-foreground border-border";
  if (p === "CRITICAL" || p === "URGENT") {
    variant = "bg-destructive/20 text-destructive border-destructive/50";
  } else if (p === "HIGH") {
    variant = "bg-amber-500/20 text-amber-500 border-amber-500/50";
  } else if (p === "MEDIUM" || p === "NORMAL") {
    variant = "bg-blue-500/20 text-blue-400 border-blue-500/50";
  }

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", variant, className)}>
      {priority}
    </span>
  );
}
