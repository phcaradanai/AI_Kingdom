import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "secondary" | "destructive";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "border border-primary bg-primary text-primary-foreground hover:bg-amber-400",
        variant === "ghost" && "text-muted-foreground hover:bg-muted hover:text-foreground",
        variant === "outline" && "border border-border bg-transparent text-foreground hover:bg-muted",
        variant === "secondary" && "bg-muted/50 text-foreground border border-border hover:bg-muted",
        variant === "destructive" && "border border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500/20",
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";
