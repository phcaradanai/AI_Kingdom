import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-card p-5 shadow-[0_1px_0_rgba(255,255,255,0.02)]", className)} {...props} />;
}
