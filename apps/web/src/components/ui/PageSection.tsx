import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ElementType;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PageSection({ title, description, icon: Icon, action, children, className, contentClassName }: PageSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
          <div className="min-w-0">
            <h2 className="break-words text-sm font-semibold text-foreground">{title}</h2>
            {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
