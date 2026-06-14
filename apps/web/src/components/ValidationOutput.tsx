import { cn } from "@/lib/utils";

const MAX_RENDERED_LINES = 300;

/** Lines matching any of these are highlighted as likely failure indicators. */
const HIGHLIGHT_PATTERN = /not ok|fail|AssertionError|ERR_|Error:|✖/i;

/**
 * Renders the last `MAX_RENDERED_LINES` lines of validation command output,
 * highlighting lines that look like failures (test runner "not ok" lines,
 * assertion errors, etc). Used so reviewers see the actual failing test and
 * stack trace, not just the npm lifecycle summary.
 */
export function ValidationOutput({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const omitted = lines.length - MAX_RENDERED_LINES;
  const visible = omitted > 0 ? lines.slice(-MAX_RENDERED_LINES) : lines;

  return (
    <pre className={cn("bg-muted rounded p-2 overflow-auto max-h-72 font-mono whitespace-pre-wrap text-[11px]", className)}>
      {omitted > 0 && <div className="text-muted-foreground">...[{omitted} earlier line{omitted === 1 ? "" : "s"} omitted]...</div>}
      {visible.map((line, i) => (
        <div key={i} className={HIGHLIGHT_PATTERN.test(line) ? "text-red-600 font-medium" : undefined}>
          {line.length > 0 ? line : " "}
        </div>
      ))}
    </pre>
  );
}
