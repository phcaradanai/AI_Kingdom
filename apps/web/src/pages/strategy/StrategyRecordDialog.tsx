import { useEffect, useState } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTk } from "@/lib/i18n";
import type {
  KingdomAssetDto,
  KingdomObjectiveDto,
  KingdomOpportunityDto,
  RevenueStreamDto,
  StrategyAssetPayload,
  StrategyObjectivePayload,
  StrategyOpportunityPayload,
  StrategyRevenueStreamPayload,
} from "@/types/api";
import {
  assetStatuses,
  assetTypes,
  blankDraft,
  humanize,
  objectiveStatuses,
  opportunityStatuses,
  priorities,
  revenueModels,
  revenueStatuses,
  selectClassName,
  splitTags,
  type StrategyEditorState,
  type StrategyPayload,
  type StrategyRecordType,
} from "./strategyModels";

type Props = {
  editor: NonNullable<StrategyEditorState>;
  assets: KingdomAssetDto[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (type: StrategyRecordType, payload: StrategyPayload, id?: string) => Promise<boolean>;
};

export function StrategyRecordDialog(props: Props) {
  const tk = useTk();
  const [draft, setDraft] = useState<StrategyPayload>(() => blankDraft(props.editor.type, props.editor.record));
  const isEdit = Boolean(props.editor.record);
  const entity = tk(`strategy.entity.${props.editor.type}`);
  const title = tk(isEdit ? "strategy.dialog.editTitle" : "strategy.dialog.createTitle", { entity });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [props.onClose]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await props.onSave(props.editor.type, draft, props.editor.record?.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
    >
      <section
        aria-label={title}
        aria-modal="true"
        className="max-h-[94vh] w-full overflow-y-auto border border-border bg-card shadow-2xl sm:max-w-3xl sm:rounded-lg"
        role="dialog"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("strategy.dialog.description")}</p>
          </div>
          <button
            aria-label={tk("strategy.dialog.close")}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            onClick={props.onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <form className="space-y-5 p-5" onSubmit={submit}>
          {props.editor.type === "objectives" ? (
            <ObjectiveFields draft={draft as StrategyObjectivePayload} onChange={setDraft} />
          ) : null}
          {props.editor.type === "opportunities" ? (
            <OpportunityFields draft={draft as StrategyOpportunityPayload} onChange={setDraft} />
          ) : null}
          {props.editor.type === "assets" ? (
            <AssetFields draft={draft as StrategyAssetPayload} onChange={setDraft} />
          ) : null}
          {props.editor.type === "revenue" ? (
            <RevenueFields assets={props.assets} draft={draft as StrategyRevenueStreamPayload} onChange={setDraft} />
          ) : null}
          {props.error ? (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{props.error}</p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button className="min-h-11" type="button" variant="outline" onClick={props.onClose}>
              {tk("strategy.cancel")}
            </Button>
            <Button
              className="min-h-11"
              disabled={props.saving || !recordName(props.editor.type, draft).trim()}
              type="submit"
            >
              <Save className="h-4 w-4" />
              {props.saving
                ? tk("strategy.saving")
                : tk(isEdit ? "strategy.saveChanges" : `strategy.save.${props.editor.type}`)}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ObjectiveFields({
  draft,
  onChange,
}: {
  draft: StrategyObjectivePayload;
  onChange: (draft: StrategyPayload) => void;
}) {
  const tk = useTk();
  return (
    <>
      <Field id="strategy-objective-title" label={tk("strategy.field.objectiveTitle")} required>
        <Input
          aria-label={tk("strategy.field.objectiveTitle")}
          autoFocus
          id="strategy-objective-title"
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </Field>
      <Field id="strategy-objective-description" label={tk("strategy.field.description")}>
        <Textarea
          id="strategy-objective-description"
          className="min-h-32"
          value={draft.description ?? ""}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="strategy-objective-priority"
          label={tk("strategy.field.priority")}
          options={priorities}
          value={draft.priority ?? "MEDIUM"}
          onChange={(value) =>
            onChange({
              ...draft,
              priority: value as StrategyObjectivePayload["priority"],
            })
          }
        />
        <SelectField
          id="strategy-objective-status"
          label={tk("strategy.field.status")}
          options={objectiveStatuses}
          value={draft.status ?? "ACTIVE"}
          onChange={(value) =>
            onChange({
              ...draft,
              status: value as StrategyObjectivePayload["status"],
            })
          }
        />
      </div>
      <Field
        id="strategy-objective-tags"
        label={tk("strategy.field.tags")}
        description={tk("strategy.field.tagsDescription")}
      >
        <Input
          id="strategy-objective-tags"
          value={draft.tags?.join(", ") ?? ""}
          onChange={(event) => onChange({ ...draft, tags: splitTags(event.target.value) })}
        />
      </Field>
    </>
  );
}

function OpportunityFields({
  draft,
  onChange,
}: {
  draft: StrategyOpportunityPayload;
  onChange: (draft: StrategyPayload) => void;
}) {
  const tk = useTk();
  return (
    <>
      <Field id="strategy-opportunity-title" label={tk("strategy.field.opportunityTitle")} required>
        <Input
          autoFocus
          id="strategy-opportunity-title"
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="strategy-opportunity-problem" label={tk("strategy.field.problem")}>
          <Textarea
            id="strategy-opportunity-problem"
            className="min-h-28"
            value={draft.problem ?? ""}
            onChange={(event) => onChange({ ...draft, problem: event.target.value })}
          />
        </Field>
        <Field id="strategy-opportunity-value" label={tk("strategy.field.proposedValue")}>
          <Textarea
            id="strategy-opportunity-value"
            className="min-h-28"
            value={draft.proposedValue ?? ""}
            onChange={(event) => onChange({ ...draft, proposedValue: event.target.value })}
          />
        </Field>
      </div>
      <Field id="strategy-opportunity-customer" label={tk("strategy.field.targetCustomer")}>
        <Input
          id="strategy-opportunity-customer"
          value={draft.targetCustomer ?? ""}
          onChange={(event) => onChange({ ...draft, targetCustomer: event.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField
          id="strategy-opportunity-score"
          label={tk("strategy.field.score")}
          value={draft.score ?? 0}
          onChange={(value) => onChange({ ...draft, score: value })}
        />
        <NumberField
          id="strategy-opportunity-revenue"
          label={tk("strategy.field.monthlyRevenue")}
          value={draft.estimatedMonthlyRevenue ?? 0}
          onChange={(value) => onChange({ ...draft, estimatedMonthlyRevenue: value })}
        />
        <SelectField
          id="strategy-opportunity-status"
          label={tk("strategy.field.status")}
          options={opportunityStatuses}
          value={draft.status ?? "INBOX"}
          onChange={(value) =>
            onChange({
              ...draft,
              status: value as StrategyOpportunityPayload["status"],
            })
          }
        />
        <SelectField
          id="strategy-opportunity-priority"
          label={tk("strategy.field.priority")}
          options={priorities}
          value={draft.priority ?? "MEDIUM"}
          onChange={(value) =>
            onChange({
              ...draft,
              priority: value as StrategyOpportunityPayload["priority"],
            })
          }
        />
        <SelectField
          id="strategy-opportunity-risk"
          label={tk("strategy.field.risk")}
          options={priorities}
          value={draft.riskLevel ?? "MEDIUM"}
          onChange={(value) =>
            onChange({
              ...draft,
              riskLevel: value as StrategyOpportunityPayload["riskLevel"],
            })
          }
        />
        <Field id="strategy-opportunity-effort" label={tk("strategy.field.effort")}>
          <Input
            id="strategy-opportunity-effort"
            value={draft.estimatedEffort ?? ""}
            onChange={(event) => onChange({ ...draft, estimatedEffort: event.target.value })}
          />
        </Field>
      </div>
      <Field id="strategy-opportunity-action" label={tk("strategy.field.nextAction")}>
        <Input
          id="strategy-opportunity-action"
          value={draft.nextAction ?? ""}
          onChange={(event) => onChange({ ...draft, nextAction: event.target.value })}
        />
      </Field>
    </>
  );
}

function AssetFields({ draft, onChange }: { draft: StrategyAssetPayload; onChange: (draft: StrategyPayload) => void }) {
  const tk = useTk();
  return (
    <>
      <Field id="strategy-asset-name" label={tk("strategy.field.assetName")} required>
        <Input
          autoFocus
          id="strategy-asset-name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="strategy-asset-type"
          label={tk("strategy.field.type")}
          options={assetTypes}
          value={draft.type ?? "PRODUCT"}
          onChange={(value) => onChange({ ...draft, type: value as StrategyAssetPayload["type"] })}
        />
        <SelectField
          id="strategy-asset-status"
          label={tk("strategy.field.status")}
          options={assetStatuses}
          value={draft.status ?? "IDEA"}
          onChange={(value) =>
            onChange({
              ...draft,
              status: value as StrategyAssetPayload["status"],
            })
          }
        />
      </div>
      <Field id="strategy-asset-hypothesis" label={tk("strategy.field.valueHypothesis")}>
        <Textarea
          id="strategy-asset-hypothesis"
          className="min-h-32"
          value={draft.valueHypothesis ?? ""}
          onChange={(event) => onChange({ ...draft, valueHypothesis: event.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="strategy-asset-revenue"
          label={tk("strategy.field.revenueEstimate")}
          value={draft.monthlyRevenueEstimate ?? 0}
          onChange={(value) => onChange({ ...draft, monthlyRevenueEstimate: value })}
        />
        <NumberField
          id="strategy-asset-cost"
          label={tk("strategy.field.costEstimate")}
          value={draft.monthlyCostEstimate ?? 0}
          onChange={(value) => onChange({ ...draft, monthlyCostEstimate: value })}
        />
      </div>
    </>
  );
}

function RevenueFields({
  draft,
  assets,
  onChange,
}: {
  draft: StrategyRevenueStreamPayload;
  assets: KingdomAssetDto[];
  onChange: (draft: StrategyPayload) => void;
}) {
  const tk = useTk();
  return (
    <>
      <Field id="strategy-revenue-name" label={tk("strategy.field.revenueName")} required>
        <Input
          autoFocus
          id="strategy-revenue-name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="strategy-revenue-asset" label={tk("strategy.field.linkedAsset")}>
          <select
            id="strategy-revenue-asset"
            className={selectClassName}
            value={draft.assetId ?? ""}
            onChange={(event) => onChange({ ...draft, assetId: event.target.value || null })}
          >
            <option value="">{tk("strategy.noAssetLink")}</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </Field>
        <SelectField
          id="strategy-revenue-model"
          label={tk("strategy.field.model")}
          options={revenueModels}
          value={draft.model ?? "SUBSCRIPTION"}
          onChange={(value) =>
            onChange({
              ...draft,
              model: value as StrategyRevenueStreamPayload["model"],
            })
          }
        />
        <SelectField
          id="strategy-revenue-status"
          label={tk("strategy.field.status")}
          options={revenueStatuses}
          value={draft.status ?? "PLANNED"}
          onChange={(value) =>
            onChange({
              ...draft,
              status: value as StrategyRevenueStreamPayload["status"],
            })
          }
        />
        <Field id="strategy-revenue-currency" label={tk("strategy.field.currency")}>
          <Input
            id="strategy-revenue-currency"
            maxLength={8}
            value={draft.currency ?? "USD"}
            onChange={(event) => onChange({ ...draft, currency: event.target.value })}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          id="strategy-revenue-monthly"
          label={tk("strategy.field.monthlyRevenue")}
          value={draft.monthlyRevenue ?? 0}
          onChange={(value) => onChange({ ...draft, monthlyRevenue: value })}
        />
        <NumberField
          id="strategy-revenue-cost"
          label={tk("strategy.field.monthlyCost")}
          value={draft.monthlyCost ?? 0}
          onChange={(value) => onChange({ ...draft, monthlyCost: value })}
        />
        <NumberField
          id="strategy-revenue-confidence"
          label={tk("strategy.field.confidence")}
          max={1}
          step="0.05"
          value={draft.confidence ?? 0}
          onChange={(value) => onChange({ ...draft, confidence: value })}
        />
      </div>
      <Field id="strategy-revenue-notes" label={tk("strategy.field.notes")}>
        <Textarea
          id="strategy-revenue-notes"
          className="min-h-28"
          value={draft.notes ?? ""}
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
        />
      </Field>
    </>
  );
}

function Field(props: {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FormField id={props.id} label={props.label} description={props.description} required={props.required}>
      {props.children}
    </FormField>
  );
}

function SelectField({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const tk = useTk();
  return (
    <Field id={id} label={label}>
      <select id={id} className={selectClassName} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {tk(`strategy.enum.${option}`) === `strategy.enum.${option}`
              ? humanize(option)
              : tk(`strategy.enum.${option}`)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function NumberField({
  id,
  label,
  value,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  max?: number;
  step?: string;
  onChange: (value: number) => void;
}) {
  return (
    <Field id={id} label={label}>
      <Input
        id={id}
        max={max}
        min={0}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function recordName(type: StrategyRecordType, payload: StrategyPayload) {
  return type === "objectives" || type === "opportunities"
    ? (payload as StrategyObjectivePayload | StrategyOpportunityPayload).title
    : (payload as StrategyAssetPayload | StrategyRevenueStreamPayload).name;
}

export type StrategyRecordDto = KingdomObjectiveDto | KingdomOpportunityDto | KingdomAssetDto | RevenueStreamDto;
