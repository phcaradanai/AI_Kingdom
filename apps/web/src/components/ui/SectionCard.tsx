import React from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: React.ReactNode;
  icon?: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SectionCard({ title, icon: Icon, action, children, className, contentClassName }: SectionCardProps) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      {(title || action) && (
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" />}
            {title && <h2 className="min-w-0 break-words text-sm font-semibold text-foreground">{title}</h2>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("p-5", contentClassName)}>
        {children}
      </div>
    </section>
  );
}
