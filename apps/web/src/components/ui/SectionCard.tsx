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
    <div className={cn("rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            {Icon && <Icon className="h-5 w-5 text-primary" />}
            {title && <h3 className="font-display text-lg text-foreground">{title}</h3>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={cn("p-5", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
