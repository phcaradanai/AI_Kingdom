import React from "react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-primary">{eyebrow}</div>
        <h1 className="mt-1.5 break-words text-2xl font-semibold leading-tight text-foreground sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{action}</div>}
    </div>
  );
}
