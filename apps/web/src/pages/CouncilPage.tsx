import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { UsersRound, ScrollText, ChevronRight, FileText, Cpu, AlertTriangle, Sparkles } from "lucide-react";
import { AgentPortrait } from "@/components/AgentPortrait";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { MarkdownDocument } from "@/components/ui/MarkdownDocument";
import { getModelDisplayName, getProviderDisplayName, getProviderTerminologyText } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { CouncilSessionDto } from "@/types/api";

export function CouncilPage() {
  const sessions = useKingdomStore((state) => state.councilSessions);
  const reports = useKingdomStore((state) => state.reports);
  const [selectedId, setSelectedId] = useState<string | null>(sessions[0]?.id ?? null);
  const selectedSession = sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;
  const reportBySession = useMemo(
    () => new Map(reports.filter((report) => report.sourceCouncilSessionId).map((report) => [report.sourceCouncilSessionId, report])),
    [reports]
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow="Royal Archive"
        title="Council Records"
        description="Review past decrees, selected agents, memory consulted, final counsel, and linked Royal Reports."
      />
      
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <h2 className="font-display text-lg tracking-wide text-foreground">Session History</h2>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{sessions.length} Records</span>
          </div>

          <div className="space-y-3 overflow-y-auto pr-1 max-h-[800px] scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
            {sessions.map((session) => {
              const linkedReport = session.reports?.[0] ?? reportBySession.get(session.id);
              const isSelected = selectedSession?.id === session.id;
              return (
                <button 
                  key={session.id} 
                  className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded-xl" 
                  onClick={() => setSelectedId(session.id)}
                >
                  <SectionCard 
                    className={cn(
                      "transition-all duration-300 hover:border-primary/50",
                      isSelected 
                        ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(214,170,87,0.1)]" 
                        : "border-border/50 bg-muted/10 hover:bg-muted/30"
                    )}
                    contentClassName="p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className={cn("font-semibold line-clamp-2", isSelected ? "text-primary" : "text-foreground")}>
                          {session.task?.title ?? "Council Session"}
                        </h3>
                        <p className="mt-1.5 text-xs text-muted-foreground">{formatDate(session.createdAt)}</p>
                      </div>
                      <StatusBadge status={session.status} />
                    </div>
                    
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {session.responses.slice(0, 3).map((response) => (
                        <span key={response.id} className="rounded-md bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/50">
                          {response.role}
                        </span>
                      ))}
                      {session.responses.length > 3 && (
                         <span className="rounded-md bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/50">
                           +{session.responses.length - 3}
                         </span>
                      )}
                      {linkedReport && (
                        <span className="rounded-md bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/30 flex items-center gap-1">
                          <FileText className="h-2.5 w-2.5" />
                          Report
                        </span>
                      )}
                    </div>
                  </SectionCard>
                </button>
              );
            })}
            
            {sessions.length === 0 && (
              <EmptyState 
                icon={UsersRound}
                title="No Council Sessions" 
                description="Send a decree to the Grand Vizier from the Throne Room." 
              />
            )}
          </div>
        </div>

        <div>
          {selectedSession ? (
            <CouncilDetail session={selectedSession} linkedReport={selectedSession.reports?.[0] ?? reportBySession.get(selectedSession.id) ?? null} />
          ) : (
            <div className="hidden lg:flex h-full items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/5">
              <div className="text-center">
                <UsersRound className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm font-medium text-muted-foreground/60 tracking-wide uppercase">Select a session to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CouncilDetail({ session, linkedReport }: { session: CouncilSessionDto; linkedReport: ReportLike | null }) {
  return (
    <SectionCard className="h-full border-primary/20 bg-background/50 shadow-sm relative overflow-hidden" contentClassName="p-0">
      <div className="absolute right-0 top-0 opacity-5 pointer-events-none">
        <UsersRound className="h-64 w-64 -mt-10 -mr-10 text-primary" />
      </div>

      <div className="p-6 md:p-8 border-b border-border/50 relative z-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-3">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                Council Record
              </span>
              <StatusBadge status={session.status} />
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground"></span>
                {session.task?.mode} DECREE
              </span>
            </div>
            <h2 className="font-display text-3xl font-bold leading-tight">{session.task?.title ?? "Council Session"}</h2>
            <p className="mt-2 text-sm text-foreground/70 flex items-center gap-2">
               Convened on {formatDate(session.createdAt)}
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-border/50 bg-muted/20 p-5">
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-primary mb-2 flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Source Decree
          </h3>
          <p className="text-sm leading-relaxed text-foreground/80 font-medium italic">"{session.task?.command}"</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          {session.providerName && (
            <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/50 px-3 py-1.5 text-muted-foreground font-medium">
              <Cpu className="h-3.5 w-3.5" />
              {getProviderDisplayName(session.providerName)}{session.modelUsed ? ` · ${getModelDisplayName(session.modelUsed)}` : ""}
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/50 px-3 py-1.5 text-muted-foreground font-medium">
            <span className="font-bold text-foreground">{session.consultedMemoryIds.length}</span> Memories Consulted
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/50 px-3 py-1.5 text-muted-foreground font-medium">
            <span className="font-bold text-foreground">{session.autoSavedMemoryIds.length}</span> Auto-saved
          </div>
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-8 relative z-10">
        {session.fallbackNotice && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
             <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
             <p className="text-sm leading-relaxed text-amber-500/90 font-medium">{getProviderTerminologyText(session.fallbackNotice)}</p>
          </div>
        )}

        {session.finalSummary && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-6 shadow-[inset_0_0_20px_rgba(214,170,87,0.05)]">
            <div className="mb-4 flex items-center gap-3">
              <AgentPortrait agent={{ name: "Aurelian", title: "Grand Vizier" }} size="md" status="SUMMARIZING" />
              <h3 className="text-lg font-display text-primary flex items-center gap-2">
                 <Sparkles className="h-5 w-5" />
                 Grand Vizier's Synthesis
              </h3>
            </div>
            <MarkdownDocument content={session.finalSummary} className="max-w-none" />
            {session.finalTraceId && (
              <Link to={`/usage-traces/${session.finalTraceId}`} className="mt-4 inline-flex text-xs font-semibold uppercase tracking-wider text-primary hover:underline">
                View Synthesis Trace
              </Link>
            )}
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground border-b border-border/50 pb-2">
            Council Responses
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {session.responses.map((response) => (
              <div key={response.id} className="rounded-xl border border-border/50 bg-muted/10 p-5 hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <AgentPortrait agent={response.agent} size="sm" status="COMPLETED" />
                  <div>
                    <div className="text-sm font-bold text-foreground">{response.role}</div>
                    <div className="text-[10px] uppercase tracking-wider text-primary/70">{response.agent.specialty}</div>
                  </div>
                </div>
                <MarkdownDocument content={response.response} className="max-w-none text-xs" />
                {response.traceId && (
                  <Link to={`/usage-traces/${response.traceId}`} className="mt-3 inline-flex text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline">
                    View Response Trace
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>

        {linkedReport && (
          <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 to-transparent p-5 mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/20">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Generated Royal Report</div>
                <p className="text-sm font-semibold text-foreground">{linkedReport.title}</p>
              </div>
            </div>
            <Link to="/reports" className="shrink-0">
              <Button variant="secondary" className="w-full sm:w-auto h-9">
                View Report
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

type ReportLike = {
  id: string;
  title: string;
};
