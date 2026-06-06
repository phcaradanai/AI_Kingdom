import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface MarkdownDocumentProps {
  content: string;
  className?: string;
}

export function MarkdownDocument({ content, className }: MarkdownDocumentProps) {
  return (
    <div className={cn("text-sm leading-relaxed text-foreground/90 space-y-4", className)}>
      <ReactMarkdown
        components={{
          h1: ({node, ...props}) => <h1 className="mt-8 mb-4 font-display text-3xl font-bold text-primary" {...props} />,
          h2: ({node, ...props}) => <h2 className="mt-8 mb-4 font-display text-2xl font-bold text-primary" {...props} />,
          h3: ({node, ...props}) => <h3 className="mt-6 mb-3 font-display text-xl font-semibold text-foreground" {...props} />,
          p: ({node, ...props}) => <p className="mb-4 leading-7" {...props} />,
          ul: ({node, ...props}) => <ul className="mb-4 ml-6 list-disc space-y-2" {...props} />,
          ol: ({node, ...props}) => <ol className="mb-4 ml-6 list-decimal space-y-2" {...props} />,
          li: ({node, ...props}) => <li {...props} />,
          a: ({node, ...props}) => <a className="text-primary hover:underline" {...props} />,
          strong: ({node, ...props}) => <strong className="font-semibold text-foreground" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground" {...props} />,
          code: ({node, inline, ...props}: any) => inline 
            ? <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground" {...props} />
            : <code {...props} />,
          pre: ({node, ...props}) => <pre className="mb-4 overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-sm text-foreground" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
