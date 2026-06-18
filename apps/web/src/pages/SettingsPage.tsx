import { KeyRound, ServerCog, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeLanguage, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getModelDisplayName, getProviderDisplayName, getProviderModeBadge } from "@/lib/providerDisplay";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { SettingDto } from "@/types/api";

type SettingOption = {
  value: string;
  label: string;
  description?: string;
};

type SettingMetadata =
  | { type: "boolean"; label?: string }
  | { type: "enum"; label?: string; options: SettingOption[] }
  | { type: "number"; label?: string; min?: number; max?: number; integer?: boolean; allowEmpty?: boolean; step?: string; helper?: string }
  | { type: "text"; label?: string }
  | { type: "longText"; label?: string; language?: "json" | "text" };

const SETTING_METADATA: Record<string, SettingMetadata> = {
  COUNCIL_AUTO_WORK_ORDER_MODE: {
    type: "enum",
    options: [
      { value: "OFF", label: "Disabled", description: "Planner work orders stay manual after council completion." },
      { value: "DRAFT", label: "Draft for King review", description: "Planner creates draft work orders that still require King review." },
      { value: "READY", label: "Ready for assignment", description: "Planner creates work orders already marked ready for assignment." }
    ]
  },
  AUTO_ASSIGN_WORK_ORDERS: { type: "boolean" },
  AUTO_GENERATE_REPORTS: { type: "boolean" },
  AUTO_SAVE_MEMORY: { type: "boolean" },
  ALLOW_RUNNER_PR_CREATE: { type: "boolean" },
  AI_TIMEOUT_MS: { type: "number", min: 1000, max: 120000, integer: true, step: "1000", helper: "Positive integer milliseconds. Backend accepts 1000 to 120000." },
  DAILY_BUDGET_LIMIT_USD: { type: "number", min: 0, allowEmpty: true, step: "0.01", helper: "Use a decimal USD value. Leave empty to disable the daily limit." },
  AI_COST_MODE: {
    type: "enum",
    options: [
      { value: "low", label: "Low cost", description: "Prefer lower-cost provider routes." },
      { value: "balanced", label: "Balanced", description: "Balance price, speed, and quality." },
      { value: "quality", label: "Quality", description: "Prefer stronger models when available." }
    ]
  },
  UI_LANGUAGE: {
    type: "enum",
    options: [
      { value: "en", label: "English", description: "Use the default English interface." },
      { value: "th", label: "ภาษาไทย", description: "Use the Thai language patch across the web app." }
    ]
  },
  AI_MAX_TOKENS: { type: "number", min: 64, max: 8000, integer: true, step: "64" },
  AUTO_PLAN_WORK_ORDERS: { type: "boolean" },
  ROUTING_DEBUG_MODE: { type: "boolean" },
  ALLOW_PRODUCTION_FALLBACK_IN_SANDBOX: { type: "boolean" },
  ALLOW_RUNNER_BRANCH_PUSH: { type: "boolean" },
  MONTHLY_BUDGET_LIMIT_USD: { type: "number", min: 0, allowEmpty: true, step: "0.01", helper: "Use a decimal USD value. Leave empty to disable the monthly limit." },
  LIVING_LOOP_ENABLED: { type: "boolean" },
  LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS: { type: "boolean" },
  LIVING_LOOP_AUTO_SANDBOX_PATCH: { type: "boolean" },
  LIVING_LOOP_ALLOW_BRANCH_PUSH: { type: "boolean" },
  LIVING_LOOP_ALLOW_PR_CREATE: { type: "boolean" },
  LIVING_LOOP_ALLOW_PAID_PROVIDERS: { type: "boolean" },
  LIVING_LOOP_INTERVAL_MINUTES: { type: "number", min: 1, integer: true, step: "1" },
  LIVING_LOOP_MIN_CONFIDENCE: { type: "number", min: 0, max: 100, integer: true, step: "1" },
  LIVING_LOOP_MAX_CANDIDATES_PER_RUN: { type: "number", min: 1, integer: true, step: "1" },
  LIVING_LOOP_MAX_DAILY_CANDIDATES: { type: "number", min: 0, integer: true, step: "1" },
  LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS: { type: "number", min: 0, integer: true, step: "1" },
  LIVING_LOOP_VALIDATION_JOB_COOLDOWN_MINUTES: { type: "number", min: 0, integer: true, step: "1" },
  LIVING_LOOP_MAX_DAILY_SANDBOX_PATCH_JOBS: { type: "number", min: 0, integer: true, step: "1" },
  LIVING_LOOP_SANDBOX_PATCH_COOLDOWN_MINUTES: { type: "number", min: 0, integer: true, step: "1" },
  LIVING_LOOP_AUTO_PATCH_MIN_CONFIDENCE: { type: "number", min: 0, max: 100, integer: true, step: "1" }
};

export function SettingsPage() {
  const settings = useKingdomStore((state) => state.settings);
  const providers = useKingdomStore((state) => state.providers);
  const updateSetting = useKingdomStore((state) => state.updateSetting);
  const { setLanguage } = useI18n();
  const groups = {
    AI: settings.filter((setting) => setting.category === "AI"),
    SYSTEM: settings.filter((setting) => setting.category === "SYSTEM"),
    UI: settings.filter((setting) => setting.category === "UI"),
    SECURITY: settings.filter((setting) => setting.category === "SECURITY")
  };

  async function update(key: string, value: string) {
    await updateSetting(key, value);
    if (key === "UI_LANGUAGE") setLanguage(normalizeLanguage(value));
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Kingdom configuration"
        description="Tune AI provider defaults and system behavior. API keys remain server-only in `.env`."
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,34rem),1fr))] gap-4">
        <div className="space-y-4">
          <SettingsCard icon={<KeyRound className="h-5 w-5 text-primary" />} title="AI Settings" settings={groups.AI} onUpdate={update} />
          <Card>
            <ServerCog className="h-5 w-5 text-primary" />
            <h2 className="mt-4 font-display text-xl">Provider Status</h2>
            <div className="mt-4 space-y-3">
              {providers.map((provider) => (
                <div key={provider.id} className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{getProviderDisplayName(provider)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{getModelDisplayName(provider.defaultModel)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-border px-2 py-1">{provider.isActive ? "active" : "inactive"}</span>
                      <span className="rounded-full border border-border px-2 py-1">{getProviderModeBadge(provider)}</span>
                      <span className="rounded-full border border-border px-2 py-1">{provider.costTier}</span>
                      <span className="rounded-full border border-border px-2 py-1">{provider.hasCredentials ? "env" : "no env"}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {provider.supportsChat ? <span>chat</span> : null}
                    {provider.supportsTools ? <span>tools</span> : null}
                    {provider.supportsVision ? <span>vision</span> : null}
                    {provider.supportsJsonMode ? <span>json</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <SettingsCard icon={<SlidersHorizontal className="h-5 w-5 text-primary" />} title="UI Settings" settings={groups.UI} onUpdate={update} />
        <SettingsCard icon={<SlidersHorizontal className="h-5 w-5 text-primary" />} title="System Behavior" settings={groups.SYSTEM} onUpdate={update} />
        <Card>
          <ServerCog className="h-5 w-5 text-primary" />
          <h2 className="mt-4 font-display text-xl">Backend</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-border pb-3">
              <dt className="text-muted-foreground">API URL</dt>
              <dd>{import.meta.env.VITE_API_URL ?? "http://localhost:4000/api"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Database</dt>
              <dd>PostgreSQL via Prisma</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-3">
              <dt className="text-muted-foreground">Frontend Mode</dt>
              <dd>{import.meta.env.MODE}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="mt-4 font-display text-xl">Security</h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            API keys are never returned by the settings or providers APIs. Configure secrets only in the server `.env`.
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Provider selection, model names, and per-provider timeouts are also configured in `.env` and the Provider Registry.
          </p>
        </Card>
      </div>
    </>
  );
}

function SettingsCard({ icon, title, settings, onUpdate }: { icon: ReactNode; title: string; settings: SettingDto[]; onUpdate: (key: string, value: string) => Promise<void> }) {
  return (
    <Card className="min-w-0 border border-amber-300/10 bg-card/80">
      <div className="flex items-center gap-3">
        {icon}
        <h2 className="min-w-0 break-words font-display text-xl">{title}</h2>
      </div>
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,25rem),1fr))] gap-4">
        {settings.map((setting) => (
          <SettingRow key={setting.key} setting={setting} onUpdate={onUpdate} />
        ))}
      </div>
    </Card>
  );
}

function SettingRow({ setting, onUpdate }: { setting: SettingDto; onUpdate: (key: string, value: string) => Promise<void> }) {
  const metadata = getSettingMetadata(setting);
  const inputId = `setting-${setting.key}`;
  const isModified = setting.defaultValue !== null && setting.value !== setting.defaultValue;
  const [draftValue, setDraftValue] = useState(setting.value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const selectedOption = metadata.type === "enum" ? metadata.options.find((option) => option.value === draftValue || option.value === setting.value) : undefined;
  const isDraftDirty = draftValue !== setting.value;

  useEffect(() => {
    setDraftValue(setting.value);
  }, [setting.value]);

  async function saveValue(nextValue: string) {
    if (saving) return;
    const validationError = validateSettingValue(metadata, setting.key, nextValue);
    if (validationError) {
      setError(validationError);
      setFeedback(null);
      return;
    }
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      await onUpdate(setting.key, nextValue);
      setFeedback("Saved");
    } catch (updateError) {
      setDraftValue(setting.value);
      setError(updateError instanceof Error ? updateError.message : "Unable to save setting.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    await saveValue(draftValue);
  }

  return (
    <div data-testid={`setting-row-${setting.key}`} className="min-w-0 rounded-lg border border-border/80 bg-muted/25 p-4 shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,17rem)] lg:items-start">
        <div className="min-w-0 flex-1">
          {metadata.type === "boolean" ? (
            <div className="break-words text-sm font-semibold">{setting.key}</div>
          ) : (
            <label htmlFor={inputId} className="block break-words text-sm font-semibold">{setting.key}</label>
          )}
          {setting.description ? <div className="mt-1 text-xs leading-5 text-muted-foreground break-words">{setting.description}</div> : null}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {setting.defaultValue !== null ? (
              <span className="min-w-0 break-words">
                default: <span className="font-mono">{setting.defaultValue === "" ? "empty" : setting.defaultValue}</span>
              </span>
            ) : null}
            {isModified ? <span className="text-amber-500">modified</span> : null}
            <span>updated {new Date(setting.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <SettingControl
            id={inputId}
            setting={setting}
            metadata={metadata}
            value={draftValue}
            saving={saving}
            dirty={isDraftDirty}
            onValueChange={(value) => {
              setDraftValue(value);
              setError(null);
              setFeedback(null);
            }}
            onImmediateSave={(value) => {
              setDraftValue(value);
              void saveValue(value);
            }}
            onSave={() => void saveDraft()}
          />
          {metadata.type === "enum" && selectedOption?.description ? (
            <p className="text-xs leading-5 text-muted-foreground" data-testid={`setting-explanation-${setting.key}`}>{selectedOption.description}</p>
          ) : null}
          {metadata.type === "number" && metadata.helper ? <p className="text-xs leading-5 text-muted-foreground">{metadata.helper}</p> : null}
          <div className="min-h-5" aria-live="polite">
            {saving ? <p className="text-xs text-amber-300">Saving...</p> : null}
            {!saving && feedback ? <p className="text-xs text-emerald-300">{feedback}</p> : null}
            {error ? <p role="alert" className="text-xs leading-5 text-destructive">{error}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingControl({
  id,
  setting,
  metadata,
  value,
  saving,
  dirty,
  onValueChange,
  onImmediateSave,
  onSave
}: {
  id: string;
  setting: SettingDto;
  metadata: SettingMetadata;
  value: string;
  saving: boolean;
  dirty: boolean;
  onValueChange: (value: string) => void;
  onImmediateSave: (value: string) => void;
  onSave: () => void;
}) {
  if (metadata.type === "boolean") {
    return (
      <div className="grid grid-cols-2 rounded-md border border-border bg-background/40 p-1" role="group" aria-label={setting.key}>
        {[
          { value: "true", label: "Enabled" },
          { value: "false", label: "Disabled" }
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "h-9 rounded px-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60",
              setting.value === option.value ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            disabled={saving || setting.value === option.value}
            onClick={() => onImmediateSave(option.value)}
          >
            {saving && setting.value !== option.value ? "Saving..." : option.label}
          </button>
        ))}
      </div>
    );
  }

  if (metadata.type === "enum") {
    return (
      <select
        id={id}
        className="h-11 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        value={value}
        disabled={saving}
        onChange={(event) => onImmediateSave(event.target.value)}
      >
        {metadata.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (metadata.type === "longText") {
    return (
      <div className="space-y-2">
        <Textarea
          id={id}
          className={cn("min-h-28 font-mono text-xs", metadata.language === "json" && "font-mono")}
          value={value}
          disabled={saving}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <SaveButton dirty={dirty} saving={saving} onSave={onSave} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        id={id}
        type={metadata.type === "number" ? "number" : "text"}
        min={metadata.type === "number" ? metadata.min : undefined}
        max={metadata.type === "number" ? metadata.max : undefined}
        step={metadata.type === "number" ? metadata.step ?? (metadata.integer ? "1" : "any") : undefined}
        value={value}
        disabled={saving}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <SaveButton dirty={dirty} saving={saving} onSave={onSave} />
    </div>
  );
}

function SaveButton({ dirty, saving, onSave }: { dirty: boolean; saving: boolean; onSave: () => void }) {
  return (
    <Button type="button" variant={dirty ? "primary" : "outline"} className="w-full" disabled={!dirty || saving} onClick={onSave}>
      {saving ? "Saving..." : dirty ? "Save" : "Saved"}
    </Button>
  );
}

function getSettingMetadata(setting: SettingDto): SettingMetadata {
  const explicit = SETTING_METADATA[setting.key];
  if (explicit) return explicit;
  if (["true", "false"].includes(setting.value) || ["true", "false"].includes(setting.defaultValue ?? "")) return { type: "boolean" };
  const sample = setting.value || setting.defaultValue || "";
  if (sample !== "" && Number.isFinite(Number(sample))) return { type: "number", step: Number.isInteger(Number(sample)) ? "1" : "any", integer: Number.isInteger(Number(sample)) };
  const trimmed = sample.trim();
  if (trimmed.length > 120 || trimmed.startsWith("{") || trimmed.startsWith("[")) return { type: "longText", language: trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "text" };
  return { type: "text" };
}

function validateSettingValue(metadata: SettingMetadata, key: string, value: string): string | null {
  if (metadata.type === "boolean" && !["true", "false"].includes(value)) return `${key} must be true or false.`;
  if (metadata.type === "enum" && !metadata.options.some((option) => option.value === value)) {
    return `${key} must be one of: ${metadata.options.map((option) => option.value).join(", ")}.`;
  }
  if (metadata.type === "number") {
    if (value === "" && metadata.allowEmpty) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return `${key} must be a number.`;
    if (metadata.integer && !Number.isInteger(parsed)) return `${key} must be a whole number.`;
    if (metadata.min !== undefined && parsed < metadata.min) return `${key} must be at least ${metadata.min}.`;
    if (metadata.max !== undefined && parsed > metadata.max) return `${key} must be at most ${metadata.max}.`;
  }
  if (metadata.type === "longText" && metadata.language === "json" && value.trim()) {
    try {
      JSON.parse(value);
    } catch {
      return `${key} must contain valid JSON.`;
    }
  }
  return null;
}
