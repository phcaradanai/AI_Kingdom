import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <>
      <PageHeader
        eyebrow="Royal Archive"
        title="Council Records"
        description="Review past decrees, selected agents, memory consulted, final counsel, and linked Royal Reports."
      />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          {sessions.map((session) => {
            const linkedReport = session.reports?.[0] ?? reportBySession.get(session.id);
            return (
              <button key={session.id} className="block w-full text-left" onClick={() => setSelectedId(session.id)}>
                <Card className={cn("transition", selectedSession?.id === session.id && "border-primary/60 bg-primary/10")}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg">{session.task?.title ?? "Council Session"}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(session.createdAt)}</p>
                    </div>
                    <StatusBadge status={session.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {session.responses.map((response) => <Badge key={response.id} label={response.role} />)}
                    {linkedReport ? <Badge label="Report Ready" highlight /> : null}
                  </div>
                </Card>
              </button>
            );
          })}
          {sessions.length === 0 ? (
            <Card>
              <p className="text-sm text-muted-foreground">No council sessions yet. Send a decree to the Grand Vizier from the Throne Room.</p>
            </Card>
          ) : null}
        </div>

        {selectedSession ? (
          <CouncilDetail session={selectedSession} linkedReport={selectedSession.reports?.[0] ?? reportBySession.get(selectedSession.id) ?? null} />
        ) : null}
      </div>
    </>
  );
}

function CouncilDetail({ session, linkedReport }: { session: CouncilSessionDto; linkedReport: ReportLike | null }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Council Record</div>
          <h2 className="mt-2 font-display text-3xl">{session.task?.title ?? "Council Session"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {session.task?.mode} decree · {formatDate(session.createdAt)}
          </p>
        </div>
        <StatusBadge status={session.status} />
      </div>

      <section className="mt-5 rounded-lg border border-border bg-background/40 p-4">
        <div className="text-sm font-semibold text-primary">Source Decree</div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{session.task?.command}</p>
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        {session.providerName ? <Badge label={`${session.providerName}${session.modelUsed ? ` · ${session.modelUsed}` : ""}`} /> : null}
        {session.responses.map((response) => <Badge key={response.id} label={response.role} highlight />)}
        <Badge label={`${session.consultedMemoryIds.length} Kingdom Memories consulted`} />
        <Badge label={`${session.autoSavedMemoryIds.length} memories auto-saved`} />
        {linkedReport ? <Badge label={`Report ${linkedReport.id.slice(0, 8)}`} highlight /> : null}
      </div>

      {linkedReport ? (
        <section className="mt-5 rounded-lg border border-primary/30 bg-primary/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-primary">Generated Royal Report</div>
              <p className="mt-2 text-sm">{linkedReport.title}</p>
            </div>
            <Button variant="outline" onClick={() => window.location.assign("/reports")}>Open Reports</Button>
          </div>
        </section>
      ) : null}

      {session.fallbackNotice ? (
        <div className="mt-5 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">{session.fallbackNotice}</div>
      ) : null}

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        {session.responses.map((response) => (
          <div key={response.id} className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="text-sm font-semibold text-primary">{response.role}</div>
            <div className="mt-1 text-xs text-muted-foreground">{response.agent.specialty}</div>
            <p className="mt-3 text-sm leading-6">{response.response}</p>
          </div>
        ))}
      </section>

      {session.finalSummary ? (
        <section className="mt-5 rounded-lg border border-primary/30 bg-primary/10 p-4">
          <div className="text-sm font-semibold text-primary">Final Counsel</div>
          <p className="mt-3 text-sm leading-6">{session.finalSummary}</p>
        </section>
      ) : null}
    </Card>
  );
}

type ReportLike = {
  id: string;
  title: string;
};

function Badge({ label, highlight = false }: { label: string; highlight?: boolean }) {
  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-xs", highlight ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground")}>
      {label}
    </span>
  );
}
