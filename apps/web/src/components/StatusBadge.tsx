import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        status === "COMPLETED" && "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
        status === "FAILED" && "border-red-400/40 bg-red-400/10 text-red-200",
        status === "RUNNING" && "border-primary/40 bg-primary/10 text-primary",
        status === "PENDING" && "border-border bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  );
}
