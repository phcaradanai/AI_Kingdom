import { FormEvent, type ElementType, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, BriefcaseBusiness, CheckCircle2, ClipboardList, DollarSign, FlaskConical, Plus, RefreshCw, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatCard } from "@/components/ui/StatCard";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type {
  KingdomAssetDto,
  KingdomAssetStatus,
  KingdomAssetType,
  KingdomObjectiveDto,
  KingdomObjectiveStatus,
  KingdomOpportunityDto,
  MatterPriority,
  OpportunityStatus,
  RevenueModel,
  RevenueStreamDto,
  RevenueStreamStatus,
  StrategyAssetPayload,
  StrategyObjectivePayload,
  StrategyOpportunityPayload,
  StrategyOverviewDto,
  StrategyRevenueStreamPayload
} from "@/types/api";

const priorities: MatterPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const objectiveStatuses: KingdomObjectiveStatus[] = ["ACTIVE", "PAUSED", "ACHIEVED", "ARCHIVED"];
const opportunityStatuses: OpportunityStatus[] = ["INBOX", "REVIEWING", "VALIDATING", "APPROVED", "REJECTED", "ARCHIVED"];
const assetTypes: KingdomAssetType[] = ["PRODUCT", "TEMPLATE", "SERVICE", "KNOWLEDGE", "AUTOMATION", "CONTENT", "COMMUNITY", "OTHER"];
const assetStatuses: KingdomAssetStatus[] = ["IDEA", "BUILDING", "ACTIVE", "MONETIZING", "PAUSED", "ARCHIVED"];
const revenueModels: RevenueModel[] = ["SUBSCRIPTION", "ONE_TIME", "SERVICE", "AFFILIATE", "ADS", "LICENSING", "OTHER"];
const revenueStatuses: RevenueStreamStatus[] = ["PLANNED", "TESTING", "ACTIVE", "PAUSED", "ENDED"];

const blankObjective: StrategyObjectivePayload = {
  title: "",
  description: "",
  priority: "MEDIUM",
  status: "ACTIVE",
  tags: []
};

const blankOpportunity: StrategyOpportunityPayload = {
  title: "",
  problem: "",
  proposedValue: "",
  targetCustomer: "",
  priority: "MEDIUM",
  riskLevel: "MEDIUM",
  score: 50,
  estimatedMonthlyRevenue: 0,
  estimatedEffort: "",
  nextAction: "",
  status: "INBOX",
  tags: []
};

const blankAsset: StrategyAssetPayload = {
  name: "",
  type: "PRODUCT",
  status: "IDEA",
  description: "",
  valueHypothesis: "",
  targetCustomer: "",
  monthlyRevenueEstimate: 0,
  monthlyCostEstimate: 0,
  tags: []
};

const blankRevenueStream: StrategyRevenueStreamPayload = {
  name: "",
  assetId: null,
  model: "SUBSCRIPTION",
  status: "PLANNED",
  currency: "USD",
  monthlyRevenue: 0,
  monthlyCost: 0,
  confidence: 0.5,
  notes: ""
};

export function StrategyPage() {
  const user = useAuthStore((state) => state.user);
  const canEdit = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const [overview, setOverview] = useState<StrategyOverviewDto | null>(null);
  const [objectives, setObjectives] = useState<KingdomObjectiveDto[]>([]);
  const [opportunities, setOpportunities] = useState<KingdomOpportunityDto[]>([]);
  const [assets, setAssets] = useState<KingdomAssetDto[]>([]);
  const [revenueStreams, setRevenueStreams] = useState<RevenueStreamDto[]>([]);
  const [objectiveDraft, setObjectiveDraft] = useState<StrategyObjectivePayload>(blankObjective);
  const [opportunityDraft, setOpportunityDraft] = useState<StrategyOpportunityPayload>(blankOpportunity);
  const [assetDraft, setAssetDraft] = useState<StrategyAssetPayload>(blankAsset);
  const [revenueDraft, setRevenueDraft] = useState<StrategyRevenueStreamPayload>(blankRevenueStream);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [overviewResult, objectiveResult, opportunityResult, assetResult, revenueResult] = await Promise.all([
        api.getStrategyOverview(),
        api.strategyObjectives(),
        api.strategyOpportunities(),
        api.strategyAssets(),
        api.strategyRevenueStreams()
      ]);
      setOverview(overviewResult.overview);
      setObjectives(objectiveResult.objectives);
      setOpportunities(opportunityResult.opportunities);
      setAssets(assetResult.assets);
      setRevenueStreams(revenueResult.revenueStreams);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load strategy ledger");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const topOpportunities = useMemo(
    () => [...opportunities].sort((a, b) => b.score - a.score || b.estimatedMonthlyRevenue - a.estimatedMonthlyRevenue).slice(0, 8),
    [opportunities]
  );

  async function submitObjective(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !objectiveDraft.title.trim()) return;
    await submit("objective", async () => {
      await api.createStrategyObjective(normalizeObjective(objectiveDraft));
      setObjectiveDraft(blankObjective);
      setNotice("Objective saved.");
    });
  }

  async function submitOpportunity(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !opportunityDraft.title.trim()) return;
    await submit("opportunity", async () => {
      await api.createStrategyOpportunity(normalizeOpportunity(opportunityDraft));
      setOpportunityDraft(blankOpportunity);
      setNotice("Opportunity captured.");
    });
  }

  async function submitAsset(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !assetDraft.name.trim()) return;
    await submit("asset", async () => {
      await api.createStrategyAsset(normalizeAsset(assetDraft));
      setAssetDraft(blankAsset);
      setNotice("Asset saved.");
    });
  }

  async function submitRevenue(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !revenueDraft.name.trim()) return;
    await submit("revenue", async () => {
      await api.createStrategyRevenueStream(normalizeRevenue(revenueDraft));
      setRevenueDraft(blankRevenueStream);
      setNotice("Revenue stream saved.");
    });
  }

  async function submit(key: string, action: () => Promise<void>) {
    setSubmitting(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      await load(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save strategy record");
    } finally {
      setSubmitting(null);
    }
  }

  async function updateOpportunityStatus(opportunity: KingdomOpportunityDto, status: OpportunityStatus) {
    if (!canEdit) return;
    await submit(`opportunity-${opportunity.id}`, async () => {
      await api.updateStrategyOpportunity(opportunity.id, { status });
      setNotice("Opportunity status updated.");
    });
  }

  async function updateObjectiveStatus(objective: KingdomObjectiveDto, status: KingdomObjectiveStatus) {
    if (!canEdit) return;
    await submit(`objective-${objective.id}`, async () => {
      await api.updateStrategyObjective(objective.id, { status });
      setNotice("Objective status updated.");
    });
  }

  async function createWorkOrder(opportunity: KingdomOpportunityDto) {
    if (!canEdit) return;
    await submit(`work-order-${opportunity.id}`, async () => {
      const result = await api.createStrategyOpportunityWorkOrder(opportunity.id);
      setNotice(`Work Order created: ${result.workOrder.title}`);
    });
  }

  if (loading) return <LoadingState message="Loading strategy ledger..." />;
  if (error && !overview) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <>
      <PageHeader
        eyebrow="Kingdom Strategy Ledger"
        title="Strategy Ledger"
        description="A working ledger for objectives, assets, revenue streams, opportunities, and validation experiments."
        action={
          <Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {error ? <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      {notice ? <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</div> : null}
      {!canEdit ? <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">Read-only access. KING or CROWN_PRINCE approval is required to change strategy records.</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Monthly Net" value={money(overview?.revenue.monthlyNet ?? 0)} icon={DollarSign} description={`${money(overview?.revenue.monthlyRevenue ?? 0)} revenue / ${money(overview?.revenue.monthlyCost ?? 0)} cost`} />
        <StatCard title="Active Objectives" value={overview?.objectives.active ?? 0} icon={Target} description={`${overview?.objectives.atRiskMetrics ?? 0} metrics need attention`} />
        <StatCard title="Opportunities" value={overview?.opportunities.inbox ?? 0} icon={BriefcaseBusiness} description={`${overview?.opportunities.validating ?? 0} validating / ${overview?.opportunities.approved ?? 0} approved`} />
        <StatCard title="Monetizing Assets" value={overview?.assets.monetizing ?? 0} icon={BarChart3} description={`${overview?.assets.active ?? 0} active assets`} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(360px,420px)_1fr]">
        <div className="space-y-5">
          <Card>
            <SectionTitle icon={Target} title="New Objective" />
            <form className="mt-4 space-y-3" onSubmit={submitObjective}>
              <Input disabled={!canEdit} value={objectiveDraft.title} onChange={(e) => setObjectiveDraft({ ...objectiveDraft, title: e.target.value })} placeholder="Objective title" />
              <Textarea disabled={!canEdit} value={objectiveDraft.description ?? ""} onChange={(e) => setObjectiveDraft({ ...objectiveDraft, description: e.target.value })} placeholder="Why this matters" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select disabled={!canEdit} value={objectiveDraft.priority ?? "MEDIUM"} onChange={(value) => setObjectiveDraft({ ...objectiveDraft, priority: value as MatterPriority })} options={priorities} />
                <Input disabled={!canEdit} value={(objectiveDraft.tags ?? []).join(", ")} onChange={(e) => setObjectiveDraft({ ...objectiveDraft, tags: csv(e.target.value) })} placeholder="Tags" />
              </div>
              {canEdit ? <Button disabled={submitting === "objective"}><Plus className="h-4 w-4" />Save Objective</Button> : null}
            </form>
          </Card>

          <Card>
            <SectionTitle icon={BriefcaseBusiness} title="Capture Opportunity" />
            <form className="mt-4 space-y-3" onSubmit={submitOpportunity}>
              <Input disabled={!canEdit} value={opportunityDraft.title} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, title: e.target.value })} placeholder="Opportunity title" />
              <Textarea disabled={!canEdit} value={opportunityDraft.problem ?? ""} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, problem: e.target.value })} placeholder="Problem" />
              <Textarea disabled={!canEdit} value={opportunityDraft.proposedValue ?? ""} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, proposedValue: e.target.value })} placeholder="Proposed value" />
              <Input disabled={!canEdit} value={opportunityDraft.targetCustomer ?? ""} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, targetCustomer: e.target.value })} placeholder="Target customer" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input disabled={!canEdit} type="number" value={opportunityDraft.score ?? 0} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, score: Number(e.target.value) })} placeholder="Score" />
                <Input disabled={!canEdit} type="number" value={opportunityDraft.estimatedMonthlyRevenue ?? 0} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, estimatedMonthlyRevenue: Number(e.target.value) })} placeholder="Monthly revenue" />
                <Select disabled={!canEdit} value={opportunityDraft.priority ?? "MEDIUM"} onChange={(value) => setOpportunityDraft({ ...opportunityDraft, priority: value as MatterPriority })} options={priorities} />
                <Select disabled={!canEdit} value={opportunityDraft.riskLevel ?? "MEDIUM"} onChange={(value) => setOpportunityDraft({ ...opportunityDraft, riskLevel: value as MatterPriority })} options={priorities} />
              </div>
              <Input disabled={!canEdit} value={opportunityDraft.nextAction ?? ""} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, nextAction: e.target.value })} placeholder="Next action" />
              {canEdit ? <Button disabled={submitting === "opportunity"}><Plus className="h-4 w-4" />Save Opportunity</Button> : null}
            </form>
          </Card>

          <Card>
            <SectionTitle icon={BarChart3} title="Asset + Revenue" />
            <form className="mt-4 space-y-3" onSubmit={submitAsset}>
              <Input disabled={!canEdit} value={assetDraft.name} onChange={(e) => setAssetDraft({ ...assetDraft, name: e.target.value })} placeholder="Asset name" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select disabled={!canEdit} value={assetDraft.type ?? "PRODUCT"} onChange={(value) => setAssetDraft({ ...assetDraft, type: value as KingdomAssetType })} options={assetTypes} />
                <Select disabled={!canEdit} value={assetDraft.status ?? "IDEA"} onChange={(value) => setAssetDraft({ ...assetDraft, status: value as KingdomAssetStatus })} options={assetStatuses} />
              </div>
              <Textarea disabled={!canEdit} value={assetDraft.valueHypothesis ?? ""} onChange={(e) => setAssetDraft({ ...assetDraft, valueHypothesis: e.target.value })} placeholder="Value hypothesis" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input disabled={!canEdit} type="number" value={assetDraft.monthlyRevenueEstimate ?? 0} onChange={(e) => setAssetDraft({ ...assetDraft, monthlyRevenueEstimate: Number(e.target.value) })} placeholder="Revenue estimate" />
                <Input disabled={!canEdit} type="number" value={assetDraft.monthlyCostEstimate ?? 0} onChange={(e) => setAssetDraft({ ...assetDraft, monthlyCostEstimate: Number(e.target.value) })} placeholder="Cost estimate" />
              </div>
              {canEdit ? <Button variant="outline" disabled={submitting === "asset"}><Plus className="h-4 w-4" />Save Asset</Button> : null}
            </form>

            <form className="mt-5 space-y-3 border-t border-border pt-4" onSubmit={submitRevenue}>
              <Input disabled={!canEdit} value={revenueDraft.name} onChange={(e) => setRevenueDraft({ ...revenueDraft, name: e.target.value })} placeholder="Revenue stream name" />
              <Select disabled={!canEdit} value={revenueDraft.assetId ?? ""} onChange={(value) => setRevenueDraft({ ...revenueDraft, assetId: value || null })} options={["", ...assets.map((asset) => asset.id)]} labels={{ "": "No asset link", ...Object.fromEntries(assets.map((asset) => [asset.id, asset.name])) }} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select disabled={!canEdit} value={revenueDraft.model ?? "SUBSCRIPTION"} onChange={(value) => setRevenueDraft({ ...revenueDraft, model: value as RevenueModel })} options={revenueModels} />
                <Select disabled={!canEdit} value={revenueDraft.status ?? "PLANNED"} onChange={(value) => setRevenueDraft({ ...revenueDraft, status: value as RevenueStreamStatus })} options={revenueStatuses} />
                <Input disabled={!canEdit} type="number" value={revenueDraft.monthlyRevenue ?? 0} onChange={(e) => setRevenueDraft({ ...revenueDraft, monthlyRevenue: Number(e.target.value) })} placeholder="Monthly revenue" />
                <Input disabled={!canEdit} type="number" value={revenueDraft.monthlyCost ?? 0} onChange={(e) => setRevenueDraft({ ...revenueDraft, monthlyCost: Number(e.target.value) })} placeholder="Monthly cost" />
              </div>
              {canEdit ? <Button variant="outline" disabled={submitting === "revenue"}><Plus className="h-4 w-4" />Save Revenue Stream</Button> : null}
            </form>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <SectionTitle icon={BriefcaseBusiness} title="Opportunity Pipeline" />
            <div className="mt-4 space-y-3">
              {topOpportunities.length === 0 ? <EmptyState title="No opportunities" description="Capture the first strategy opportunity to start validation." /> : null}
              {topOpportunities.map((opportunity) => (
                <div key={opportunity.id} className="rounded-lg border border-border/60 bg-muted/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-lg text-foreground">{opportunity.title}</h2>
                        <StatusPill value={opportunity.status} />
                        <StatusPill value={`Score ${opportunity.score}`} subtle />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{opportunity.proposedValue || opportunity.problem || "No summary recorded."}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-xl text-primary">{money(opportunity.estimatedMonthlyRevenue)}</div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">monthly estimate</div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <span>Priority: {opportunity.priority}</span>
                    <span>Risk: {opportunity.riskLevel}</span>
                    <span>Customer: {opportunity.targetCustomer || "Unassigned"}</span>
                  </div>
                  {opportunity.nextAction ? <div className="mt-3 rounded-md border border-border/40 bg-background/30 p-3 text-sm">{opportunity.nextAction}</div> : null}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Select disabled={!canEdit} value={opportunity.status} onChange={(value) => void updateOpportunityStatus(opportunity, value as OpportunityStatus)} options={opportunityStatuses} compact />
                    {canEdit ? (
                      <Button variant="outline" className="h-8 px-3 text-xs" disabled={submitting === `work-order-${opportunity.id}`} onClick={() => void createWorkOrder(opportunity)}>
                        <ClipboardList className="h-4 w-4" />
                        Create Work Order
                      </Button>
                    ) : null}
                    {opportunity.sourceId ? <span className="text-xs text-muted-foreground">Source: {opportunity.sourceType ?? "strategy"} / {opportunity.sourceId}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <SectionTitle icon={Target} title="Objectives" />
              <div className="mt-4 space-y-3">
                {objectives.length === 0 ? <EmptyState title="No objectives" description="Create measurable objectives for the kingdom plan." /> : null}
                {objectives.slice(0, 8).map((objective) => (
                  <div key={objective.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{objective.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{objective.description || "No description"}</p>
                      </div>
                      <StatusPill value={objective.priority} subtle />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Select disabled={!canEdit} value={objective.status} onChange={(value) => void updateObjectiveStatus(objective, value as KingdomObjectiveStatus)} options={objectiveStatuses} compact />
                      {objective.project ? <Link className="inline-flex items-center gap-1 text-xs text-primary hover:underline" to={`/projects/${objective.project.id}`}>{objective.project.name}<ArrowRight className="h-3 w-3" /></Link> : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <SectionTitle icon={DollarSign} title="Revenue Streams" />
              <div className="mt-4 space-y-3">
                {revenueStreams.length === 0 ? <EmptyState title="No revenue streams" description="Track planned, testing, and active monetization paths." /> : null}
                {revenueStreams.slice(0, 8).map((stream) => (
                  <div key={stream.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{stream.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{stream.asset?.name ?? stream.model}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-lg text-primary">{money(stream.monthlyRevenue - stream.monthlyCost)}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{stream.status}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <SectionTitle icon={FlaskConical} title="Assets" />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {assets.length === 0 ? <EmptyState title="No assets" description="Register products, templates, services, knowledge, automations, and content." /> : null}
              {assets.slice(0, 10).map((asset) => (
                <div key={asset.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{asset.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{asset.type} / {asset.status}</p>
                    </div>
                    <CheckCircle2 className={cn("h-4 w-4", asset.status === "MONETIZING" ? "text-emerald-400" : "text-muted-foreground")} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{asset.valueHypothesis || asset.description || "No hypothesis recorded."}</p>
                  <div className="mt-3 text-xs text-muted-foreground">{money(asset.monthlyRevenueEstimate - asset.monthlyCostEstimate)} estimated net</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="font-display text-xl">{title}</h2>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  labels,
  disabled,
  compact
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <select
      disabled={disabled}
      className={cn(
        "h-10 rounded-md border border-border bg-input px-3 text-sm text-foreground",
        compact && "h-8 text-xs"
      )}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>{labels?.[option] ?? option}</option>
      ))}
    </select>
  );
}

function StatusPill({ value, subtle = false }: { value: string; subtle?: boolean }) {
  return (
    <span className={cn(
      "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
      subtle ? "border-border bg-muted/20 text-muted-foreground" : "border-primary/30 bg-primary/10 text-primary"
    )}>
      {value}
    </span>
  );
}

function normalizeObjective(payload: StrategyObjectivePayload): StrategyObjectivePayload {
  return {
    ...payload,
    title: payload.title.trim(),
    description: payload.description?.trim() ?? "",
    tags: payload.tags ?? []
  };
}

function normalizeOpportunity(payload: StrategyOpportunityPayload): StrategyOpportunityPayload {
  return {
    ...payload,
    title: payload.title.trim(),
    problem: payload.problem?.trim() ?? "",
    proposedValue: payload.proposedValue?.trim() ?? "",
    targetCustomer: payload.targetCustomer?.trim() ?? "",
    nextAction: payload.nextAction?.trim() ?? "",
    score: clamp(Number(payload.score ?? 0), 0, 100),
    estimatedMonthlyRevenue: Math.max(0, Number(payload.estimatedMonthlyRevenue ?? 0))
  };
}

function normalizeAsset(payload: StrategyAssetPayload): StrategyAssetPayload {
  return {
    ...payload,
    name: payload.name.trim(),
    description: payload.description?.trim() ?? "",
    valueHypothesis: payload.valueHypothesis?.trim() ?? "",
    targetCustomer: payload.targetCustomer?.trim() ?? "",
    monthlyRevenueEstimate: Math.max(0, Number(payload.monthlyRevenueEstimate ?? 0)),
    monthlyCostEstimate: Math.max(0, Number(payload.monthlyCostEstimate ?? 0))
  };
}

function normalizeRevenue(payload: StrategyRevenueStreamPayload): StrategyRevenueStreamPayload {
  return {
    ...payload,
    name: payload.name.trim(),
    assetId: payload.assetId || null,
    currency: payload.currency?.trim().toUpperCase() || "USD",
    monthlyRevenue: Math.max(0, Number(payload.monthlyRevenue ?? 0)),
    monthlyCost: Math.max(0, Number(payload.monthlyCost ?? 0))
  };
}

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
