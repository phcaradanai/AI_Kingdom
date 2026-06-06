import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = "An Error Occurred", message = "Something went wrong. Please try again.", onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center", className)}>
      <AlertTriangle className="mb-4 h-8 w-8 text-destructive/80" />
      <h3 className="mb-2 font-display text-lg text-foreground">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-6 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive">
          Try Again
        </Button>
      )}
    </div>
  );
}
