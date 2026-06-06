import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
  type?: "default" | "success" | "warning" | "error" | "info";
}

export function StatusBadge({ status, className, type }: StatusBadgeProps) {
  let mappedType = type;
  
  // Auto-map some common statuses if type not provided
  if (!mappedType) {
    const s = status.toUpperCase();
    if (["READY", "COMPLETED", "ACTIVE", "CONFIRMED"].includes(s)) mappedType = "success";
    else if (["MISSING KEY", "ERROR", "FAILED", "REJECTED"].includes(s)) mappedType = "error";
    else if (["INACTIVE", "NEEDS_REVIEW", "PENDING"].includes(s)) mappedType = "warning";
    else mappedType = "default";
  }

  const variants = {
    default: "bg-muted text-muted-foreground border-border",
    success: "bg-primary/20 text-primary border-primary/50",
    warning: "bg-amber-500/20 text-amber-500 border-amber-500/50",
    error: "bg-destructive/20 text-destructive border-destructive/50",
    info: "bg-blue-500/20 text-blue-400 border-blue-500/50"
  };

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", variants[mappedType], className)}>
      {status}
    </span>
  );
}
