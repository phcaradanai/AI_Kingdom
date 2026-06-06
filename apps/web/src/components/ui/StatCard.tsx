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
    <div className={cn("rounded-xl border border-border bg-card/60 p-5 backdrop-blur-sm", className)}>
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {Icon && <Icon className="h-5 w-5 text-primary/70" />}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="font-display text-3xl font-bold text-foreground">{value}</div>
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
