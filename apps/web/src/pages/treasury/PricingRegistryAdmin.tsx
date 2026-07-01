import { type FormEvent, useEffect, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useTk } from "@/lib/i18n";
import { getModelDisplayName, getProviderDisplayName } from "@/lib/providerDisplay";
import type { ModelPricingDto, ModelPricingPayload, PricingWarningsDto } from "@/types/api";

const blankPricing: ModelPricingPayload = {
  providerType: "",
  model: "",
  displayName: "",
  inputPerMillion: null,
  outputPerMillion: 0,
  notes: "",
};

export function PricingRegistryAdmin() {
  const tk = useTk();
  const [records, setRecords] = useState<ModelPricingDto[]>([]);
  const [warnings, setWarnings] = useState<PricingWarningsDto | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ModelPricingPayload>>({});
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<ModelPricingPayload>(blankPricing);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [pricing, pricingWarnings] = await Promise.allSettled([api.modelPricing(), api.treasuryPricingWarnings()]);
    if (pricing.status === "fulfilled") setRecords(pricing.value.modelPricing);
    else setError(tk("treasury.pricing.unavailable"));
    if (pricingWarnings.status === "fulfilled") setWarnings(pricingWarnings.value);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createRecord(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api.createModelPricing(newDraft);
      setAdding(false);
      setNewDraft(blankPricing);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tk("treasury.pricing.createFailed"));
    }
  }

  async function saveRecord(id: string) {
    setError(null);
    try {
      await api.updateModelPricing(id, draft);
      setEditingId(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tk("treasury.pricing.saveFailed"));
    }
  }

  async function deactivate(id: string) {
    setError(null);
    try {
      await api.deleteModelPricing(id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tk("treasury.pricing.deleteFailed"));
    }
  }

  return (
    <div className="min-w-0">
      {warnings && warnings.unknownModels.length > 0 ? (
        <div className="mb-3 border border-red-400/30 bg-red-400/5 p-3 text-xs text-red-300">
          {tk("treasury.pricing.unknown", { items: warnings.unknownModels.map((item) => `${getProviderDisplayName(item.provider)}:${getModelDisplayName(item.model)} (${item.count})`).join(", ") })}
        </div>
      ) : null}
      <Button className="min-h-11" onClick={() => setAdding(true)} variant="outline"><Plus className="h-4 w-4" />{tk("treasury.pricing.add")}</Button>
      {adding ? <PricingForm draft={newDraft} onCancel={() => setAdding(false)} onChange={setNewDraft} onSubmit={createRecord} /> : null}
      {error ? <div className="mt-3 text-sm text-red-300" role="alert">{error}</div> : null}
      <div className="mt-4 divide-y divide-border border-y border-border">
        {records.length === 0 ? <div className="py-5 text-sm text-muted-foreground">{tk("treasury.pricing.empty")}</div> : records.map((record) => (
          <div className="min-w-0 py-4" key={record.id}>
            {editingId === record.id ? (
              <EditPricing record={record} draft={draft} onChange={setDraft} onCancel={() => setEditingId(null)} onSave={() => void saveRecord(record.id)} />
            ) : (
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="break-words text-sm font-medium">{record.displayName ?? getModelDisplayName(record.model)}</div>
                  <div className="mt-1 break-words text-xs text-muted-foreground">{getProviderDisplayName(record.providerType)} · {record.model}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{tk("treasury.pricing.priceLine", { input: record.inputPerMillion ?? record.inputCacheMissPerMillion ?? "—", output: record.outputPerMillion })}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="min-h-11" onClick={() => { setEditingId(record.id); setDraft({ inputPerMillion: record.inputPerMillion, inputCacheHitPerMillion: record.inputCacheHitPerMillion, inputCacheMissPerMillion: record.inputCacheMissPerMillion, outputPerMillion: record.outputPerMillion, notes: record.notes }); }} variant="outline">{tk("treasury.pricing.edit")}</Button>
                  {record.isActive ? <Button aria-label={tk("treasury.pricing.deactivate", { name: record.displayName ?? record.model })} className="min-h-11" onClick={() => void deactivate(record.id)} variant="ghost"><Trash2 className="h-4 w-4" /></Button> : null}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PricingForm({ draft, onChange, onCancel, onSubmit }: { draft: ModelPricingPayload; onChange: (value: ModelPricingPayload) => void; onCancel: () => void; onSubmit: (event: FormEvent) => void }) {
  const tk = useTk();
  return (
    <form className="mt-4 grid gap-3 border border-border p-4 sm:grid-cols-2" onSubmit={onSubmit}>
      <Input aria-label={tk("treasury.pricing.providerType")} className="min-h-11" onChange={(event) => onChange({ ...draft, providerType: event.target.value })} placeholder={tk("treasury.pricing.providerType")} required value={draft.providerType} />
      <Input aria-label={tk("treasury.pricing.model")} className="min-h-11" onChange={(event) => onChange({ ...draft, model: event.target.value })} placeholder={tk("treasury.pricing.model")} required value={draft.model} />
      <Input aria-label={tk("treasury.pricing.displayName")} className="min-h-11" onChange={(event) => onChange({ ...draft, displayName: event.target.value })} placeholder={tk("treasury.pricing.displayName")} value={draft.displayName ?? ""} />
      <Input aria-label={tk("treasury.pricing.inputPrice")} className="min-h-11" min="0" onChange={(event) => onChange({ ...draft, inputPerMillion: event.target.value ? Number(event.target.value) : null })} placeholder={tk("treasury.pricing.inputPrice")} step="0.000001" type="number" value={draft.inputPerMillion ?? ""} />
      <Input aria-label={tk("treasury.pricing.outputPrice")} className="min-h-11" min="0" onChange={(event) => onChange({ ...draft, outputPerMillion: Number(event.target.value) || 0 })} placeholder={tk("treasury.pricing.outputPrice")} required step="0.000001" type="number" value={draft.outputPerMillion} />
      <Input aria-label={tk("treasury.pricing.notes")} className="min-h-11" onChange={(event) => onChange({ ...draft, notes: event.target.value })} placeholder={tk("treasury.pricing.notes")} value={draft.notes ?? ""} />
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button className="min-h-11" type="submit"><Save className="h-4 w-4" />{tk("treasury.pricing.save")}</Button>
        <Button className="min-h-11" onClick={onCancel} type="button" variant="outline"><X className="h-4 w-4" />{tk("treasury.pricing.cancel")}</Button>
      </div>
    </form>
  );
}

function EditPricing({ record, draft, onChange, onCancel, onSave }: { record: ModelPricingDto; draft: Partial<ModelPricingPayload>; onChange: (value: Partial<ModelPricingPayload>) => void; onCancel: () => void; onSave: () => void }) {
  const tk = useTk();
  return (
    <div>
      <div className="text-sm font-medium">{record.displayName ?? record.model}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input aria-label={tk("treasury.pricing.inputPrice")} className="min-h-11" min="0" onChange={(event) => onChange({ ...draft, inputPerMillion: event.target.value ? Number(event.target.value) : null })} placeholder={tk("treasury.pricing.inputPrice")} step="0.000001" type="number" value={draft.inputPerMillion ?? ""} />
        <Input aria-label={tk("treasury.pricing.cacheHitPrice")} className="min-h-11" min="0" onChange={(event) => onChange({ ...draft, inputCacheHitPerMillion: event.target.value ? Number(event.target.value) : null })} placeholder={tk("treasury.pricing.cacheHitPrice")} step="0.000001" type="number" value={draft.inputCacheHitPerMillion ?? ""} />
        <Input aria-label={tk("treasury.pricing.cacheMissPrice")} className="min-h-11" min="0" onChange={(event) => onChange({ ...draft, inputCacheMissPerMillion: event.target.value ? Number(event.target.value) : null })} placeholder={tk("treasury.pricing.cacheMissPrice")} step="0.000001" type="number" value={draft.inputCacheMissPerMillion ?? ""} />
        <Input aria-label={tk("treasury.pricing.outputPrice")} className="min-h-11" min="0" onChange={(event) => onChange({ ...draft, outputPerMillion: Number(event.target.value) || 0 })} placeholder={tk("treasury.pricing.outputPrice")} step="0.000001" type="number" value={draft.outputPerMillion ?? 0} />
      </div>
      <Input aria-label={tk("treasury.pricing.notes")} className="mt-3 min-h-11" onChange={(event) => onChange({ ...draft, notes: event.target.value })} placeholder={tk("treasury.pricing.notes")} value={draft.notes ?? ""} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="min-h-11" onClick={onSave}><Save className="h-4 w-4" />{tk("treasury.pricing.saveChanges")}</Button>
        <Button className="min-h-11" onClick={onCancel} variant="outline"><X className="h-4 w-4" />{tk("treasury.pricing.cancel")}</Button>
      </div>
    </div>
  );
}
