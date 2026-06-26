import { FormEvent, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import { getProviderDisplayName } from "@/lib/providerDisplay";
import { cn } from "@/lib/utils";
import {
  blankDraft,
  blankEntry,
  draftFromChain,
  getEntryModel,
  getProviderForEntry,
  type RouteChainDraft,
  type RouteEntryDraft,
} from "./routingModels";
import type { RoutingController } from "./useRoutingController";

const TASK_MODES = ["ASK", "PLAN", "RESEARCH", "BUILD"];

export function RouteChainEditorDialog({
  controller,
}: {
  controller: RoutingController;
}) {
  const tk = useTk();
  const creating = controller.editorMode === "create";
  const selected = controller.selected;
  const [draft, setDraft] = useState<RouteChainDraft>(() =>
    creating || !selected ? blankDraft() : draftFromChain(selected),
  );

  useEffect(() => {
    setDraft(creating || !selected ? blankDraft() : draftFromChain(selected));
  }, [creating, selected]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!creating && !selected) return null;

  const title = creating
    ? tk("routing.dialog.create")
    : tk("routing.dialog.edit", { name: selected?.name ?? "" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (creating) {
      await controller.createChain(draft);
    } else {
      await controller.updateChain(draft);
    }
  }

  function updateEntry(index: number, patch: Partial<RouteEntryDraft>) {
    setDraft({
      ...draft,
      entries: draft.entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    });
  }

  function moveEntry(from: number, to: number) {
    const entries = [...draft.entries];
    const [item] = entries.splice(from, 1);
    if (!item) return;
    entries.splice(to, 0, item);
    setDraft({ ...draft, entries });
  }

  function removeEntry(index: number) {
    setDraft({
      ...draft,
      entries: draft.entries.filter((_, entryIndex) => entryIndex !== index),
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
    >
      <section
        aria-label={title}
        aria-modal="true"
        className="max-h-[94vh] w-full max-w-4xl overflow-y-auto border border-border bg-card shadow-2xl sm:rounded-lg"
        role="dialog"
      >
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {creating
                ? tk("routing.dialog.createDescription")
                : tk("routing.dialog.editDescription")}
            </p>
          </div>
          <button
            aria-label={tk("routing.dialog.close")}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            onClick={() => controller.setEditorMode(null)}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form className="space-y-5 p-4 sm:p-5" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={tk("routing.field.name")}>
              <Input
                aria-label={tk("routing.field.name")}
                className="min-h-11"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
                value={draft.name}
              />
            </Field>
            <Field label={tk("routing.field.scope")}>
              <select
                aria-label={tk("routing.field.scope")}
                className="min-h-11 w-full border border-input bg-background px-3 text-sm"
                disabled={!creating}
                onChange={(event) => setDraft({ ...draft, scope: event.target.value })}
                value={draft.scope}
              >
                <option value="GLOBAL">{tk("routing.scope.GLOBAL")}</option>
                <option value="TASK_MODE">{tk("routing.scope.TASK_MODE")}</option>
              </select>
            </Field>
            <Field label={tk("routing.field.taskMode")}>
              <select
                aria-label={tk("routing.field.taskMode")}
                className="min-h-11 w-full border border-input bg-background px-3 text-sm"
                disabled={!creating}
                onChange={(event) => setDraft({ ...draft, taskMode: event.target.value })}
                value={draft.taskMode}
              >
                <option value="">{tk("routing.anyMode")}</option>
                {TASK_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={tk("routing.field.description")}>
            <Input
              aria-label={tk("routing.field.description")}
              className="min-h-11"
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              placeholder={tk("routing.optional")}
              value={draft.description}
            />
          </Field>

          <div className="space-y-3">
            <div className="text-sm font-semibold">{tk("routing.sequenceTitle")}</div>
            {draft.entries.map((entry, index) => (
              <EntryEditor
                entry={entry}
                index={index}
                key={index}
                moveEntry={moveEntry}
                providers={controller.providers}
                removeEntry={removeEntry}
                total={draft.entries.length}
                updateEntry={updateEntry}
              />
            ))}
            <Button
              className="min-h-11"
              onClick={() => setDraft({ ...draft, entries: [...draft.entries, blankEntry()] })}
              type="button"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              {tk("routing.addStep")}
            </Button>
          </div>

          {controller.error ? (
            <div
              className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {controller.error}
            </div>
          ) : null}

          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            <Button
              className="min-h-11"
              onClick={() => controller.setEditorMode(null)}
              type="button"
              variant="outline"
            >
              {tk("routing.cancel")}
            </Button>
            <Button className="min-h-11" disabled={controller.saving} type="submit">
              {creating ? <Plus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {creating ? tk("routing.createChain") : tk("routing.saveChanges")}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function EntryEditor({
  entry,
  index,
  total,
  providers,
  updateEntry,
  moveEntry,
  removeEntry,
}: {
  entry: RouteEntryDraft;
  index: number;
  total: number;
  providers: RoutingController["providers"];
  updateEntry: (index: number, patch: Partial<RouteEntryDraft>) => void;
  moveEntry: (from: number, to: number) => void;
  removeEntry: (index: number) => void;
}) {
  const tk = useTk();
  const provider = getProviderForEntry(entry, providers);
  const isSandbox = entry.providerId === "local-sandbox-baseline";
  return (
    <div
      className={cn(
        "grid min-w-0 gap-3 border border-border bg-background/40 p-3 xl:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]",
        !entry.isEnabled && "opacity-60",
      )}
    >
      <div className="flex items-center gap-1 xl:flex-col">
        <Button
          aria-label={tk("routing.moveUp")}
          className="h-9 w-9 p-0"
          disabled={index === 0}
          onClick={() => moveEntry(index, index - 1)}
          type="button"
          variant="ghost"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          aria-label={tk("routing.moveDown")}
          className="h-9 w-9 p-0"
          disabled={index === total - 1}
          onClick={() => moveEntry(index, index + 1)}
          type="button"
          variant="ghost"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      </div>
      <Field label={tk("routing.field.provider")}>
        <select
          aria-label={`${tk("routing.field.provider")} ${index + 1}`}
          className="min-h-11 w-full border border-input bg-background px-3 text-sm"
          onChange={(event) =>
            updateEntry(index, { providerId: event.target.value, model: "" })
          }
          required
          value={entry.providerId}
        >
          <option value="">{tk("routing.selectProvider")}</option>
          {providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={tk("routing.field.model")}>
        <Input
          aria-label={`${tk("routing.field.model")} ${index + 1}`}
          className="min-h-11"
          onChange={(event) => updateEntry(index, { model: event.target.value })}
          placeholder={provider?.defaultModel ?? "model-id"}
          value={entry.model}
        />
      </Field>
      <Field label={tk("routing.field.notes")}>
        <Input
          aria-label={`${tk("routing.field.notes")} ${index + 1}`}
          className="min-h-11"
          onChange={(event) => updateEntry(index, { notes: event.target.value })}
          placeholder={tk("routing.optional")}
          value={entry.notes}
        />
      </Field>
      <div className="flex items-center justify-between gap-3 xl:justify-end">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
          <input
            checked={entry.isEnabled}
            className="h-4 w-4"
            onChange={(event) => updateEntry(index, { isEnabled: event.target.checked })}
            type="checkbox"
          />
          {tk("routing.field.enabled")}
        </label>
        <Button
          aria-label={isSandbox ? tk("routing.sandboxLocked") : tk("routing.removeStep")}
          className="h-11 w-11 p-0"
          disabled={isSandbox}
          onClick={() => removeEntry(index)}
          title={isSandbox ? tk("routing.sandboxLocked") : tk("routing.removeStep")}
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {!entry.model && provider ? (
        <div className="text-xs text-muted-foreground xl:col-span-5">
          {tk("routing.defaultModel")}: {getEntryModel(entry, providers)}
        </div>
      ) : null}
    </div>
  );
}

export function RouteChainDeleteDialog({
  controller,
}: {
  controller: RoutingController;
}) {
  const tk = useTk();
  const target = controller.deleteTarget;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!target) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
    >
      <section
        aria-label={tk("routing.dialog.deleteTitle")}
        aria-modal="true"
        className="w-full max-w-lg border border-border bg-card shadow-2xl sm:rounded-lg"
        role="dialog"
      >
        <div className="p-5">
          <h2 className="text-lg font-semibold">{tk("routing.dialog.deleteTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {tk("routing.dialog.deleteDescription")}
          </p>
          <div className="mt-4 border border-border bg-background/50 p-3 text-sm font-semibold">
            {target.name}
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              className="min-h-11"
              onClick={() => controller.setDeleteTarget(null)}
              type="button"
              variant="outline"
            >
              {tk("routing.cancel")}
            </Button>
            <Button
              className="min-h-11"
              disabled={controller.saving}
              onClick={() => void controller.confirmDelete()}
              type="button"
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" />
              {tk("routing.deleteConfirm")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
