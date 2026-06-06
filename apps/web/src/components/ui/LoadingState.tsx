import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = "Loading...", className }: LoadingStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-12 text-center", className)}>
      <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary/60" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}
