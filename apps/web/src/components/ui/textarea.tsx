import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-36 w-full resize-y rounded-md border border-border bg-input px-3 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-primary",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";
