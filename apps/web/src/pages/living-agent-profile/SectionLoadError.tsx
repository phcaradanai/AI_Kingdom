import { AlertTriangle, RotateCcw } from "lucide-react";
import { useTk } from "@/lib/i18n";

export function SectionLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const tk = useTk();
  return (
    <div
      role="alert"
      className="flex min-w-0 flex-col gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex min-w-0 items-start gap-2 text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="break-words">{message}</span>
      </p>
      <button
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-destructive/30 px-3 font-semibold text-destructive transition-colors hover:bg-destructive/10"
        onClick={onRetry}
        type="button"
      >
        <RotateCcw className="h-4 w-4" />
        {tk("agentProfile.retry")}
      </button>
    </div>
  );
}
