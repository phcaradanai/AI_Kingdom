import { Send, Sparkles, ScrollText, Cpu, Server, FileText } from "lucide-react";
import { FormEvent, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownDocument } from "@/components/ui/MarkdownDocument";
import { getModelDisplayName, getProviderDisplayName, getProviderTerminologyText } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { TaskDto, TaskMode } from "@/types/api";

const modes: Array<{ value: TaskMode; label: string; description: string }> = [
  { value: "ASK", label: "Ask", description: "Clarify a question or decision." },
  { value: "PLAN", label: "Plan", description: "Shape a roadmap or execution path." },
  { value: "RESEARCH", label: "Research", description: "Investigate evidence and options." },
  { value: "BUILD", label: "Build", description: "Prepare implementation work." }
];

export function ThroneRoomPage() {
  const [command, setCommand] = useState("");
  const [mode, setMode] = useState<TaskMode>("ASK");
  const [error, setError] = useState<string | null>(null);
  const [lastProcessedTaskId, setLastProcessedTaskId] = useState<string | null>(null);
  const submitCommand = useKingdomStore((state) => state.submitCommand);
  const processTask = useKingdomStore((state) => state.processTask);
  const isLoading = useKingdomStore((state) => state.isLoading);
  const isProcessing = useKingdomStore((state) => state.isProcessing);
  const tasks = useKingdomStore((state) => state.tasks);
  
  const latestTask = tasks[0];
  const latestSession = latestTask?.sessions[0];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!command.trim()) {
      setError("Enter a royal command before issuing a decree.");
      return;
    }
    try {
      const task = await submitCommand(command, mode);
      setLastProcessedTaskId(task.id);
      setCommand("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The throne room could not record the decree");
    }
  }

  async function onProcess(task: TaskDto) {
    setError(null);
    try {
      await processTask(task.id);
      setLastProcessedTaskId(task.id);
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Grand Vizier could not convene the council");
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow="Royal Command Terminal"
        title="Issue a royal decree"
        description="Capture your command, then send the decree to the Grand Vizier for deterministic council synthesis."
      />

      <SectionCard contentClassName="p-6">
        <form onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {modes.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setMode(item.value)}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-5 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
                  mode === item.value
                    ? "border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(214,170,87,0.1)]"
                    : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
                )}
              >
                <div className="font-display tracking-wide text-base">{item.label}</div>
                <div className="mt-1.5 text-xs opacity-80 leading-relaxed">{item.description}</div>
              </button>
            ))}
          </div>
          
          <div className="mt-6 relative">
            <label htmlFor="royal-command" className="mb-2 block text-sm font-semibold uppercase tracking-widest text-primary">Royal Decree</label>
            <Textarea
              id="royal-command"
              className="min-h-[200px] resize-y rounded-xl border-primary/20 bg-background/50 p-5 text-base shadow-inner focus:border-primary/50 focus:ring-primary/20"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="State the royal decree. Example: Plan a six-week launch roadmap for the AI Kingdom MVP..."
            />
            <p className="mt-2 text-xs text-muted-foreground">The decree will be evaluated by the Grand Vizier and the appropriate council members.</p>
            <div className="absolute right-4 bottom-10 opacity-10 pointer-events-none">
               <ScrollText className="h-20 w-20" />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium flex items-center gap-3">
              <div className="rounded-full bg-destructive/20 p-1"><Server className="h-4 w-4" /></div>
              {error}
            </div>
          )}
          
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-6">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Mode: <span className="rounded-md bg-primary/10 px-2 py-1 text-primary">{mode}</span>
            </div>
            <Button className="w-full sm:w-auto h-12 px-8 text-sm tracking-wide" disabled={isLoading || !command.trim()}>
              <Send className="mr-2 h-4 w-4" />
              {isLoading ? "Recording decree..." : "Issue Decree"}
            </Button>
          </div>
        </form>
      </SectionCard>

      {latestTask && (
        <SectionCard 
          className="border-primary/30 bg-primary/5 shadow-[0_0_30px_rgba(214,170,87,0.05)] relative overflow-hidden" 
          contentClassName="p-6 relative z-10"
        >
          <div className="absolute -right-10 -top-10 opacity-5 pointer-events-none">
            <Sparkles className="h-64 w-64 text-primary" />
          </div>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  <Sparkles className="mr-1.5 h-3 w-3" />
                  Grand Vizier Terminal
                </span>
                <StatusBadge status={latestTask.status} />
              </div>
              <h2 className="font-display text-2xl font-bold leading-tight">{latestTask.title}</h2>
              <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
                {latestTask.status === "COMPLETED"
                  ? "Council has convened and delivered its counsel."
                  : "Send this decree to the Grand Vizier to convene the council."}
              </p>
            </div>
            
            <div className="shrink-0">
              <Button
                variant={latestTask.status === "COMPLETED" ? "outline" : "primary"}
                className={cn("h-11 shadow-md", latestTask.status !== "COMPLETED" && "animate-pulse shadow-primary/20")}
                disabled={isProcessing || latestTask.status === "COMPLETED"}
                onClick={() => void onProcess(latestTask)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {isProcessing && lastProcessedTaskId === latestTask.id ? "Convening Council..." : "Send to Grand Vizier"}
              </Button>
            </div>
          </div>
          
          {latestSession?.finalSummary && (
            <div className="mt-8 rounded-xl border border-primary/20 bg-background/60 p-6 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4 border-b border-border/50 pb-4">
                <h3 className="font-display text-lg text-primary flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Final Counsel
                </h3>
                {latestSession.providerName && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md border border-border/50">
                    <Cpu className="h-3 w-3" />
                    {getProviderDisplayName(latestSession.providerName)}
                    {latestSession.modelUsed ? ` · ${getModelDisplayName(latestSession.modelUsed)}` : ""}
                  </div>
                )}
              </div>
              <MarkdownDocument content={latestSession.finalSummary} className="max-w-none" />
              <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground border-t border-border/50 pt-4">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/50"></div>
                  <span className="font-semibold text-foreground/80">{latestSession.consultedMemoryIds.length}</span> Memories consulted
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/50"></div>
                  <span className="font-semibold text-foreground/80">{latestSession.autoSavedMemoryIds.length}</span> Memories auto-saved
                </div>
              </div>
              {latestSession.fallbackNotice && (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-500/90 font-medium">
                  {getProviderTerminologyText(latestSession.fallbackNotice)}
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}

      <section>
        <div className="mb-6 flex items-end justify-between border-b border-border/50 pb-4">
          <h2 className="font-display text-2xl">Recent Decrees</h2>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Archive ({tasks.length})</span>
        </div>
        
        {tasks.length > 0 ? (
          <div className="grid gap-5 xl:grid-cols-2">
            {tasks.slice(0, 6).map((task) => (
              <SectionCard key={task.id} className="transition-all hover:border-primary/30 hover:shadow-sm" contentClassName="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <div className="max-w-[70%]">
                    <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors line-clamp-2">{task.title}</h3>
                    <div className="mt-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 uppercase">{task.mode}</span>
                      <span>·</span>
                      <span>{formatDate(task.createdAt)}</span>
                    </div>
                  </div>
                  <StatusBadge status={task.status} />
                </div>
                
                <p className="line-clamp-2 text-sm leading-relaxed text-foreground/70 bg-muted/20 rounded-md p-3 border border-border/50">{task.command}</p>
                
                {task.sessions[0]?.finalSummary ? (
                  <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-4 relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/40"></div>
                    <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">
                      {task.sessions[0].finalSummary}
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 flex justify-end">
                    <Button
                      variant="outline"
                      className="h-9 text-xs"
                      disabled={isProcessing || task.status === "COMPLETED"}
                      onClick={() => void onProcess(task)}
                    >
                      <Sparkles className="mr-2 h-3.5 w-3.5" />
                      {isProcessing && lastProcessedTaskId === task.id ? "Convening..." : "Send to Vizier"}
                    </Button>
                  </div>
                )}
              </SectionCard>
            ))}
          </div>
        ) : (
          <EmptyState 
            icon={ScrollText}
            title="No Royal Decrees" 
            description="Your command archive is empty. Issue your first decree above." 
            className="py-12"
          />
        )}
      </section>
    </div>
  );
}
