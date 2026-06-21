import { useEffect } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTk } from "@/lib/i18n";
import type { ProjectPayload, ProjectPriority, ProjectStatus } from "@/types/api";
import { projectPriorities, projectStatuses, selectClassName, splitCsv, splitLines } from "./projectModels";

type Props = {
  mode: "create" | "edit";
  draft: ProjectPayload;
  error: string | null;
  saving: boolean;
  onChange: (draft: ProjectPayload) => void;
  onClose: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
};

export function ProjectEditorDialog({ mode, draft, error, saving, onChange, onClose, onSubmit }: Props) {
  const tk = useTk();
  const title = mode === "edit" ? tk("projects.editor.edit") : tk("projects.editor.create");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation">
      <section
        aria-label={title}
        aria-modal="true"
        className="max-h-[92vh] w-full overflow-y-auto border border-border bg-card shadow-2xl sm:max-w-3xl sm:rounded-lg"
        role="dialog"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("projects.editor.description")}</p>
          </div>
          <button
            aria-label={tk("projects.editor.close")}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="space-y-5 p-5" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="proj-name" label={tk("projects.field.name")} required>
              <Input autoFocus id="proj-name" value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="AI Kingdom" />
            </FormField>
            <FormField id="proj-codename" label={tk("projects.field.codename")}>
              <Input id="proj-codename" value={draft.codename ?? ""} onChange={(event) => onChange({ ...draft, codename: event.target.value })} placeholder="KINGDOM" />
            </FormField>
            <FormField id="proj-status" label={tk("projects.field.status")}>
              <select id="proj-status" className={selectClassName} value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as ProjectStatus })}>
                {projectStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </FormField>
            <FormField id="proj-priority" label={tk("projects.field.priority")}>
              <select id="proj-priority" className={selectClassName} value={draft.priority} onChange={(event) => onChange({ ...draft, priority: event.target.value as ProjectPriority })}>
                {projectPriorities.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </FormField>
          </div>
          <FormField id="proj-description" label={tk("projects.field.description")}>
            <Textarea id="proj-description" value={draft.description ?? ""} onChange={(event) => onChange({ ...draft, description: event.target.value })} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="proj-milestone" label={tk("projects.field.milestone")}>
              <Input id="proj-milestone" value={draft.activeMilestone ?? ""} onChange={(event) => onChange({ ...draft, activeMilestone: event.target.value })} />
            </FormField>
            <FormField id="proj-repo" label={tk("projects.field.repository")}>
              <Input id="proj-repo" value={draft.repositoryUrl ?? ""} onChange={(event) => onChange({ ...draft, repositoryUrl: event.target.value })} placeholder="https://github.com/org/repo" />
            </FormField>
          </div>
          <FormField id="proj-local-path" label={tk("projects.field.localPath")} description={tk("projects.field.localPathDescription")}>
            <Input id="proj-local-path" value={draft.localPath ?? ""} onChange={(event) => onChange({ ...draft, localPath: event.target.value })} placeholder="/Users/you/projects/repo" />
          </FormField>
          <FormField id="proj-goals" label={tk("projects.field.goals")} description={tk("projects.field.onePerLine")}>
            <Textarea id="proj-goals" value={draft.goals?.join("\n") ?? ""} onChange={(event) => onChange({ ...draft, goals: splitLines(event.target.value) })} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="proj-keywords" label={tk("projects.field.keywords")}>
              <Input id="proj-keywords" value={draft.keywords?.join(", ") ?? ""} onChange={(event) => onChange({ ...draft, keywords: splitCsv(event.target.value) })} />
            </FormField>
            <FormField id="proj-aliases" label={tk("projects.field.aliases")}>
              <Input id="proj-aliases" value={draft.aliases?.join(", ") ?? ""} onChange={(event) => onChange({ ...draft, aliases: splitCsv(event.target.value) })} />
            </FormField>
          </div>
          {error ? <p className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button className="min-h-11" type="button" variant="outline" onClick={onClose}>{tk("projects.cancel")}</Button>
            <Button className="min-h-11" disabled={saving || !draft.name.trim()} type="submit"><Save className="h-4 w-4" />{saving ? tk("projects.saving") : tk("projects.save")}</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
