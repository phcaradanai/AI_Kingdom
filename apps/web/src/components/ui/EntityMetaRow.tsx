import React from "react";
import { cn } from "@/lib/utils";

interface MetaItem {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
}

interface EntityMetaRowProps {
  items: MetaItem[];
  className?: string;
}

export function EntityMetaRow({ items, className }: EntityMetaRowProps) {
  if (!items.length) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 text-xs", className)}>
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-1.5 text-muted-foreground">
          {item.icon && <item.icon className="h-3.5 w-3.5 opacity-70" />}
          <span className="font-medium text-foreground/70">{item.label}:</span>
          <span className="text-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
