import { Activity, AlertTriangle, BarChart2, RefreshCw, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageSection } from "@/components/ui/PageSection";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { KingdomDiagnosticsReportDto, DiagnosticsWeekBucket } from "@/types/api";

const WINDOW_OPTIONS = [
  { label: "All time", value: undefined },
  { label: "Last 7 days", value: 7 },
  { label: "Last 14 days", value: 14 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
];

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function StateTag({ state }: { state: string }) {
  const colors: Record<string, string> = {
    BLOCKED: "bg-destructive/10 text-destructive border-destructive/30",
    STALE_CONTEXT: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    NEEDS_REVIEW: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    READY: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${colors[state] ?? "bg-muted text-muted-foreground border-border"}`}>
      {state.replace("_", " ")}
    </span>
  );
}

function WeeklyTrendTable({ weeks }: { weeks: DiagnosticsWeekBucket[] }) {
  if (weeks.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No sessions in this window.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground text-xs border-b border-border">
            <th className="pb-2 pr-4 font-medium">Week</th>
            <th className="pb-2 pr-4 font-medium text-right">Sessions</th>
            <th className="pb-2 pr-4 font-medium text-right">Avg Quality</th>
            <th className="pb-2 pr-4 font-medium text-right">High ≥0.8</th>
            <th className="pb-2 pr-4 font-medium text-right">Low &lt;0.5</th>
            <th className="pb-2 pr-4 font-medium text-right">Cost USD</th>
            <th className="pb-2 font-medium text-right">Mode Corrections</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week} className="border-b border-border/50 hover:bg-muted/20">
              <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{w.week}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{w.sessionCount}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {w.avgQualityScore !== null ? (
                  <span className={w.avgQualityScore >= 0.8 ? "text-emerald-400" : w.avgQualityScore < 0.5 ? "text-destructive" : "text-amber-400"}>
                    {w.avgQualityScore.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-emerald-400">{w.highQuality}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-destructive">{w.lowQuality}</td>
              <td className="py-2 pr-4 text-right tabular-nums font-mono text-xs">${w.totalCostUSD.toFixed(5)}</td>
              <td className="py-2 text-right tabular-nums">{w.modeCorrectionCount > 0 ? <span className="text-primary">{w.modeCorrectionCount}</span> : "0"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DiagnosticsPage() {
  const [report, setReport] = useState<KingdomDiagnosticsReportDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number | undefined>(undefined);

  async function load(days?: number) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.diagnosticsIntelligence(days);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(windowDays); }, [windowDays]);

  const intel = report?.intelligence;
  const mc = report?.modeCorrection;
  const cont = report?.continuity;
  const collab = report?.collaboration;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow="M25-A"
          title="Kingdom Diagnostics"
          description="Intelligence quality, mode correction, and continuity engine metrics"
        />
        <div className="flex items-center gap-2 pb-1">
          <select
            className="text-sm bg-background border border-border rounded-md px-2 py-1 text-foreground"
            value={windowDays ?? ""}
            onChange={(e) => setWindowDays(e.target.value ? Number(e.target.value) : undefined)}
          >
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.label} value={o.value ?? ""}>{o.label}</option>
            ))}
          </select>
          <Button variant="outline" onClick={() => load(windowDays)} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !report ? (
        <LoadingState message="Loading kingdom diagnostics..." />
      ) : report && intel ? (
        <>
          {/* Council Intelligence */}
          <PageSection title="Council Intelligence" icon={BarChart2}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Decrees" value={String(intel.decrees)} />
              <StatCard title="Avg Quality" value={intel.qualityStats.scored > 0 ? intel.qualityStats.avgScore.toFixed(2) : "—"} />
              <StatCard title="High Quality ≥0.8" value={String(intel.qualityStats.highQuality)} />
              <StatCard title="Low Quality <0.5" value={String(intel.qualityStats.lowQuality)} />
              <StatCard title="Total Cost" value={`$${intel.totalCostUSD.toFixed(4)}`} />
              <StatCard title="Avg Cost / Decree" value={`$${intel.avgCostPerDecreeUSD.toFixed(5)}`} />
              <StatCard title="Fallback Rate" value={pct(intel.fallbackRate)} />
              <StatCard title="Avg AI Calls / Decree" value={String(intel.avgCallsPerDecree)} />
            </div>
          </PageSection>

          {/* Learning Loop */}
          <PageSection title="Learning Loop" icon={Zap}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Approved Knowledge" value={String(intel.approvedKnowledge.count)} />
              <StatCard title="Total Use Count" value={String(intel.approvedKnowledge.totalUseCount)} />
              <StatCard title="Never Used" value={String(intel.approvedKnowledge.neverUsed)} />
              <StatCard title="Review Verdicts" value={
                Object.entries(intel.verdictCounts).length > 0
                  ? Object.entries(intel.verdictCounts).map(([k, v]) => `${k}=${v}`).join(", ")
                  : "none"
              } />
            </div>
            {Object.keys(intel.candidatesByStatus).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(intel.candidatesByStatus).map(([status, count]) => (
                  <span key={status} className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground border border-border">
                    {status} <span className="font-bold text-foreground">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </PageSection>

          {/* Mode Auto-Correction */}
          <PageSection title="Decree Mode Auto-Correction" icon={Activity}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              <StatCard title="Total Corrections" value={String(mc?.total ?? 0)} />
              <StatCard title="Correction Rate" value={pct(mc?.rate ?? 0)} />
              <StatCard title="Active Decrees" value={String(intel.decrees)} />
            </div>
            {mc && Object.keys(mc.byCorrectedMode).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(mc.byCorrectedMode).map(([mode, count]) => (
                  <span key={mode} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary border border-primary/20">
                    ASK → {mode} <span className="font-bold">{count}×</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No mode corrections in this window.</p>
            )}
          </PageSection>

          {/* Continuity Engine */}
          <PageSection title="Continuity Engine Decisions" icon={AlertTriangle}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard title="Total Events" value={String(cont?.total ?? 0)} />
              {cont && Object.entries(cont.byState).map(([state, count]) => (
                <StatCard key={state} title={state.replace("_", " ")} value={String(count)} />
              ))}
            </div>
            {cont && cont.byTriggeredBy && Object.keys(cont.byTriggeredBy).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(cont.byTriggeredBy).map(([trigger, count]) => (
                  <span key={trigger} className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground border border-border">
                    {trigger} <span className="font-bold text-foreground">{count}</span>
                  </span>
                ))}
              </div>
            )}
            {cont && cont.recentEvents.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Recent blocked events</p>
                {cont.recentEvents.map((ev) => (
                  <div key={ev.id} className="rounded-md border border-border bg-muted/10 p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StateTag state={ev.readinessState} />
                      <span className="text-xs text-muted-foreground font-mono">{ev.triggeredBy}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{formatDate(ev.createdAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{ev.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </PageSection>

          {/* Agent Collaboration Protocol */}
          <PageSection title="Agent Collaboration Protocol (M25-C)" icon={Zap}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard title="Collaboration Sessions" value={String(collab?.total ?? 0)} />
              <StatCard title="Trigger Rate" value={pct(collab?.rate ?? 0)} />
              <StatCard title="Feature" value={collab?.enabled ? "Enabled" : "Off (default)"} />
            </div>
            {!collab?.enabled && (
              <p className="text-xs text-muted-foreground mt-3">
                Enable with <code className="bg-muted/40 px-1 rounded text-xs">COUNCIL_COLLABORATION_ENABLED=true</code> — fires a targeted Archivist follow-up when the Researcher expresses uncertainty (parallel mode only).
              </p>
            )}
          </PageSection>

          {/* Weekly Trend */}
          <PageSection title="Weekly Quality &amp; Cost Trend" icon={BarChart2}>
            <WeeklyTrendTable weeks={report.weeklyTrend} />
          </PageSection>

          {/* Intelligence Lever Snapshot */}
          <PageSection title="Intelligence Lever Settings" icon={Activity}>
            <div className="flex flex-wrap gap-2">
              {Object.entries(report.settingsSnapshot).map(([key, value]) => (
                <span key={key} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${value === "true" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-muted/20 text-muted-foreground border-border"}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${value === "true" ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                  {key.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </PageSection>

          {report.generatedAt && (
            <p className="text-xs text-muted-foreground text-right">
              Generated at {formatDate(report.generatedAt)}
              {report.windowDays ? ` · last ${report.windowDays} days` : " · all time"}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
