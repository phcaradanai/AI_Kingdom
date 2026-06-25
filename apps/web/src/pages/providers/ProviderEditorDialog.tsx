import { FormEvent, useEffect, useState } from "react";
import { KeyRound, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import { getProviderDisplayName } from "@/lib/providerDisplay";
import type { AIProviderDto } from "@/types/api";
import type {
  ProviderCreatePayload,
  ProviderEditPayload,
} from "./providerModels";
import type { ProvidersController } from "./useProvidersController";

const PROVIDER_TYPES = [
  "custom",
  "openai-compatible",
  "openai",
  "anthropic",
  "openrouter",
  "deepseek",
  "gemini",
  "local",
  "sandbox",
];
const COST_TIERS = ["FREE", "LOW", "MEDIUM", "HIGH", "PREMIUM"];

const EMPTY_CREATE: ProviderCreatePayload = {
  name: "",
  type: "custom",
  baseUrl: "",
  defaultModel: "",
  priority: 100,
  costTier: "MEDIUM",
  credentialEnvKey: "",
  capabilities: {
    supportsChat: true,
    supportsTools: false,
    supportsVision: false,
    supportsJsonMode: false,
  },
};

export function ProviderEditorDialog({
  controller,
}: {
  controller: ProvidersController;
}) {
  const tk = useTk();
  const provider = controller.selected;
  const creating = controller.editorMode === "create";
  const [createDraft, setCreateDraft] =
    useState<ProviderCreatePayload>(EMPTY_CREATE);
  const [editDraft, setEditDraft] = useState<ProviderEditPayload>(() =>
    editPayload(provider),
  );

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!creating && !provider) return null;
  const title = creating
    ? tk("providers.dialog.add")
    : tk("providers.dialog.edit", { name: getProviderDisplayName(provider!) });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (creating) {
      await controller.create({
        ...createDraft,
        baseUrl: createDraft.baseUrl || undefined,
        defaultModel: createDraft.defaultModel || undefined,
        credentialEnvKey: createDraft.credentialEnvKey || undefined,
      });
    } else {
      await controller.saveEdit(editDraft);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
    >
      <section
        aria-label={title}
        aria-modal="true"
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto border border-border bg-card shadow-2xl sm:rounded-lg"
        role="dialog"
      >
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {creating
                ? tk("providers.dialog.createDescription")
                : tk("providers.dialog.editDescription")}
            </p>
          </div>
          <button
            aria-label={tk("providers.dialog.close")}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            onClick={() => controller.setEditorMode(null)}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form className="space-y-5 p-4 sm:p-5" onSubmit={(event) => void submit(event)}>
          {creating ? (
            <CreateFields draft={createDraft} setDraft={setCreateDraft} />
          ) : (
            <EditFields draft={editDraft} setDraft={setEditDraft} />
          )}

          {controller.error ? (
            <div
              className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {controller.error}
            </div>
          ) : null}

          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            {!creating && provider?.id.startsWith("custom-") ? (
              <Button
                className="mr-auto min-h-11"
                onClick={() => {
                  controller.setEditorMode(null);
                  controller.setDeleteTarget(provider);
                }}
                type="button"
                variant="destructive"
              >
                <Trash2 className="h-4 w-4" />
                {tk("providers.delete")}
              </Button>
            ) : null}
            <Button
              className="min-h-11"
              onClick={() => controller.setEditorMode(null)}
              type="button"
              variant="outline"
            >
              {tk("providers.cancel")}
            </Button>
            <Button className="min-h-11" disabled={controller.saving} type="submit">
              {creating ? <Plus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {creating
                ? tk("providers.createProvider")
                : tk("providers.saveChanges")}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function CreateFields({
  draft,
  setDraft,
}: {
  draft: ProviderCreatePayload;
  setDraft: (draft: ProviderCreatePayload) => void;
}) {
  const tk = useTk();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tk("providers.field.name")}>
          <Input
            aria-label={tk("providers.field.name")}
            className="min-h-11"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            required
            value={draft.name}
          />
        </Field>
        <Field label={tk("providers.field.type")}>
          <select
            aria-label={tk("providers.field.type")}
            className="min-h-11 w-full border border-input bg-background px-3 text-sm"
            onChange={(event) => setDraft({ ...draft, type: event.target.value })}
            value={draft.type}
          >
            {PROVIDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tk("providers.field.baseUrl")}>
          <Input
            aria-label={tk("providers.field.baseUrl")}
            className="min-h-11"
            onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
            placeholder="https://api.example.com/v1"
            type="url"
            value={draft.baseUrl}
          />
        </Field>
        <Field label={tk("providers.field.defaultModel")}>
          <Input
            aria-label={tk("providers.field.defaultModel")}
            className="min-h-11"
            onChange={(event) =>
              setDraft({ ...draft, defaultModel: event.target.value })
            }
            required={draft.type !== "sandbox"}
            value={draft.defaultModel}
          />
        </Field>
        <Field label={tk("providers.field.priority")}>
          <Input
            aria-label={tk("providers.field.priority")}
            className="min-h-11"
            min={1}
            onChange={(event) =>
              setDraft({ ...draft, priority: Number(event.target.value) })
            }
            required
            type="number"
            value={draft.priority}
          />
        </Field>
        <Field label={tk("providers.field.costTier")}>
          <select
            aria-label={tk("providers.field.costTier")}
            className="min-h-11 w-full border border-input bg-background px-3 text-sm"
            onChange={(event) =>
              setDraft({ ...draft, costTier: event.target.value })
            }
            value={draft.costTier}
          >
            {COST_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="border-l-2 border-primary/40 bg-primary/5 p-3">
        <Field label={tk("providers.field.credentialEnv")}>
          <Input
            aria-label={tk("providers.field.credentialEnv")}
            className="min-h-11 font-mono"
            onChange={(event) =>
              setDraft({ ...draft, credentialEnvKey: event.target.value })
            }
            pattern="[A-Z0-9_]*"
            placeholder="PROVIDER_API_KEY"
            value={draft.credentialEnvKey}
          />
        </Field>
        <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {tk("providers.field.credentialHelp")}
        </p>
      </div>

      <fieldset>
        <legend className="text-xs font-semibold text-muted-foreground">
          {tk("providers.capabilities")}
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["supportsChat", "supportsTools", "supportsVision", "supportsJsonMode"] as const).map(
            (key) => (
              <label
                className="flex min-h-11 cursor-pointer items-center gap-2 border border-border px-3 text-sm"
                key={key}
              >
                <input
                  checked={Boolean(draft.capabilities[key])}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      capabilities: {
                        ...draft.capabilities,
                        [key]: event.target.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                {tk(`providers.capability.${capabilityKey(key)}`)}
              </label>
            ),
          )}
        </div>
      </fieldset>
    </>
  );
}

function EditFields({
  draft,
  setDraft,
}: {
  draft: ProviderEditPayload;
  setDraft: (draft: ProviderEditPayload) => void;
}) {
  const tk = useTk();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field className="sm:col-span-2" label={tk("providers.field.defaultModel")}>
        <Input
          aria-label={tk("providers.field.defaultModel")}
          className="min-h-11 font-mono"
          onChange={(event) => setDraft({ ...draft, defaultModel: event.target.value })}
          required
          value={draft.defaultModel}
        />
      </Field>
      <Field label={tk("providers.field.priority")}>
        <Input
          aria-label={tk("providers.field.priority")}
          className="min-h-11"
          min={1}
          onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}
          required
          type="number"
          value={draft.priority}
        />
      </Field>
      <Field label={tk("providers.field.costTier")}>
        <select
          aria-label={tk("providers.field.costTier")}
          className="min-h-11 w-full border border-input bg-background px-3 text-sm"
          onChange={(event) =>
            setDraft({
              ...draft,
              costTier: event.target.value as AIProviderDto["costTier"],
            })
          }
          value={draft.costTier}
        >
          {COST_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function Field({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function editPayload(provider: AIProviderDto | null): ProviderEditPayload {
  return {
    defaultModel: provider?.defaultModel ?? "",
    priority: provider?.priority ?? 100,
    costTier: provider?.costTier ?? "MEDIUM",
  };
}

function capabilityKey(
  key: "supportsChat" | "supportsTools" | "supportsVision" | "supportsJsonMode",
) {
  return {
    supportsChat: "chat",
    supportsTools: "tools",
    supportsVision: "vision",
    supportsJsonMode: "json",
  }[key];
}
