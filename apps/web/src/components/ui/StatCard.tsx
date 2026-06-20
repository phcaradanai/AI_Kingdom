import React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon?: React.ElementType;
  description?: string;
  className?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export function StatCard({ title, value, icon: Icon, description, className, trend }: StatCardProps) {
  return (
    <div className={cn("min-h-24 rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-xs font-medium leading-4 text-muted-foreground">{title}</h3>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-primary/75" />}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <div className="text-2xl font-semibold tabular-nums text-foreground">{value}</div>
        {trend && (
          <div className={cn("text-xs font-semibold", trend.isPositive ? "text-emerald-500" : "text-red-500")}>
            {trend.value}
          </div>
        )}
      </div>
      {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
    </div>
  );
}
