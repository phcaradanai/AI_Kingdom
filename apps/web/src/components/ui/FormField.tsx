import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FieldLabel({ htmlFor, required, children }: { htmlFor?: string; required?: boolean; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
      {required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}
    </label>
  );
}

export function FieldDescription({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-muted-foreground/80">{children}</p>;
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="text-xs font-medium text-destructive" role="alert">
      {children}
    </p>
  );
}

export function FormField({ id, label, description, error, required, children, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
      {children}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}
