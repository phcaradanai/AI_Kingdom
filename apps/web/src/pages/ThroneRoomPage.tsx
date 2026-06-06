import { Send, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
    <>
      <PageHeader
        eyebrow="Throne Room"
        title="Issue a royal command"
        description="Capture the King's command, then send the decree to the Grand Vizier for deterministic council counsel."
      />
      <Card className="overflow-hidden">
        <form onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {modes.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setMode(item.value)}
                className={cn(
                  "rounded-lg border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-primary",
                  mode === item.value
                    ? "border-primary bg-primary/15 text-foreground shadow-glow"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                <div className="text-sm font-bold">{item.label}</div>
                <div className="mt-2 text-xs leading-5">{item.description}</div>
              </button>
            ))}
          </div>
          <Textarea
            className="mt-5 min-h-48"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="State the royal decree. Example: Plan a six-week launch roadmap for the AI Kingdom MVP..."
          />
          {error ? <div className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Selected mode: <span className="font-semibold text-primary">{mode}</span>
            </div>
            <Button disabled={isLoading || !command.trim()}>
              <Send className="h-4 w-4" />
              {isLoading ? "Recording decree..." : "Issue Royal Decree"}
            </Button>
          </div>
        </form>
      </Card>

      {latestTask ? (
        <Card className="mt-6 border-primary/30 bg-primary/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Grand Vizier</div>
              <h2 className="mt-2 font-display text-2xl">{latestTask.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {latestTask.status === "COMPLETED"
                  ? "Council has delivered its counsel."
                  : "Send this decree to the Grand Vizier to convene the council."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={latestTask.status} />
              <Button
                variant={latestTask.status === "COMPLETED" ? "outline" : "primary"}
                disabled={isProcessing || latestTask.status === "COMPLETED"}
                onClick={() => void onProcess(latestTask)}
              >
                <Sparkles className="h-4 w-4" />
                {isProcessing && lastProcessedTaskId === latestTask.id ? "Grand Vizier is convening..." : "Send to Grand Vizier"}
              </Button>
            </div>
          </div>
          {latestSession?.finalSummary ? (
            <div className="mt-5 rounded-lg border border-primary/30 bg-background/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-primary">Final Summary</div>
                {latestSession.providerName ? (
                  <div className="text-xs text-muted-foreground">
                    {latestSession.providerName}
                    {latestSession.modelUsed ? ` · ${latestSession.modelUsed}` : ""}
                  </div>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6">{latestSession.finalSummary}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{latestSession.consultedMemoryIds.length} Kingdom Memories were consulted</span>
                <span>{latestSession.autoSavedMemoryIds.length} memories auto-saved</span>
              </div>
              {latestSession.fallbackNotice ? (
                <div className="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
                  {latestSession.fallbackNotice}
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl">Recent decrees</h2>
          <span className="text-xs text-muted-foreground">{tasks.length} stored tasks</span>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {tasks.slice(0, 6).map((task) => (
            <Card key={task.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{task.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.mode} decree · {formatDate(task.createdAt)}
                  </p>
                </div>
                <StatusBadge status={task.status} />
              </div>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{task.command}</p>
              {task.sessions[0]?.finalSummary ? (
                <p className="mt-4 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm leading-6">
                  {task.sessions[0].finalSummary}
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {task.sessions[0].consultedMemoryIds.length} Kingdom Memories were consulted · {task.sessions[0].autoSavedMemoryIds.length} memories auto-saved
                  </span>
                </p>
              ) : (
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    disabled={isProcessing || task.status === "COMPLETED"}
                    onClick={() => void onProcess(task)}
                  >
                    <Sparkles className="h-4 w-4" />
                    {isProcessing && lastProcessedTaskId === task.id ? "Grand Vizier is convening..." : "Send to Grand Vizier"}
                  </Button>
                </div>
              )}
            </Card>
          ))}
          {tasks.length === 0 ? (
            <Card className="xl:col-span-2">
              <p className="text-sm text-muted-foreground">No decrees have been issued yet.</p>
            </Card>
          ) : null}
        </div>
      </section>
    </>
  );
}
