import { useEffect } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTk } from "@/lib/i18n";
import type { ArtifactDto, ArtifactPayload, ArtifactType, ProjectDto } from "@/types/api";
import { artifactTypes, humanize, selectClassName, splitTags } from "./artifactModels";

type Props = {
  mode: "create" | "edit";
  projects: ProjectDto[];
  draft: ArtifactPayload;
  error: string | null;
  saving: boolean;
  onChange: (draft: ArtifactPayload) => void;
  onClose: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
};

export function ArtifactEditorDialog(props: Props) {
  const tk = useTk();
  const title = props.mode === "edit" ? tk("artifacts.editor.edit") : tk("artifacts.editor.create");
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [props.onClose]);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation"><section aria-label={title} aria-modal="true" className="max-h-[92vh] w-full overflow-y-auto border border-border bg-card shadow-2xl sm:max-w-3xl sm:rounded-lg" role="dialog"><header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card/95 px-5 py-4 backdrop-blur"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("artifacts.editor.description")}</p></div><button aria-label={tk("artifacts.editor.close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary" onClick={props.onClose} type="button"><X className="h-4 w-4" /></button></header><form className="space-y-5 p-5" onSubmit={props.onSubmit}>
    <FormField id="artifact-title" label={tk("artifacts.field.title")} required><Input autoFocus id="artifact-title" value={props.draft.title} onChange={(event) => props.onChange({ ...props.draft, title: event.target.value })} /></FormField>
    <div className="grid gap-4 sm:grid-cols-2"><FormField id="artifact-type" label={tk("artifacts.field.type")}><select id="artifact-type" className={selectClassName} value={props.draft.type} onChange={(event) => props.onChange({ ...props.draft, type: event.target.value as ArtifactType })}>{artifactTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}</select></FormField><FormField id="artifact-project" label={tk("artifacts.field.project")}><select id="artifact-project" className={selectClassName} value={props.draft.projectId ?? ""} onChange={(event) => props.onChange({ ...props.draft, projectId: event.target.value || null })}><option value="">{tk("artifacts.unassignedProject")}</option>{props.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></FormField></div>
    <FormField id="artifact-content" label={tk("artifacts.field.content")} required><Textarea id="artifact-content" className="min-h-72 font-mono text-xs" value={props.draft.content} onChange={(event) => props.onChange({ ...props.draft, content: event.target.value })} /></FormField>
    <FormField id="artifact-tags" label={tk("artifacts.field.tags")} description={tk("artifacts.field.tagsDescription")}><Input id="artifact-tags" value={props.draft.tags?.join(", ") ?? ""} onChange={(event) => props.onChange({ ...props.draft, tags: splitTags(event.target.value) })} /></FormField>
    <details className="rounded-md border border-border"><summary className="min-h-11 cursor-pointer list-none px-3 py-3 text-sm font-semibold text-muted-foreground">{tk("artifacts.editor.sourceFields")}</summary><div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2"><FormField id="artifact-source-type" label={tk("artifacts.field.sourceType")}><Input id="artifact-source-type" value={props.draft.sourceType ?? ""} onChange={(event) => props.onChange({ ...props.draft, sourceType: event.target.value })} /></FormField><FormField id="artifact-source-id" label={tk("artifacts.field.sourceId")}><Input id="artifact-source-id" value={props.draft.sourceId ?? ""} onChange={(event) => props.onChange({ ...props.draft, sourceId: event.target.value })} /></FormField></div></details>
    {props.error ? <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{props.error}</p> : null}<div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><Button className="min-h-11" type="button" variant="outline" onClick={props.onClose}>{tk("artifacts.cancel")}</Button><Button className="min-h-11" disabled={props.saving || !props.draft.title.trim() || !props.draft.content.trim()} type="submit"><Save className="h-4 w-4" />{props.saving ? tk("artifacts.saving") : tk("artifacts.save")}</Button></div>
  </form></section></div>;
}

export function ArtifactDeleteDialog({ artifact, busy, onClose, onConfirm }: { artifact: ArtifactDto; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const tk = useTk();
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation"><section aria-label={tk("artifacts.deleteTitle")} aria-modal="true" className="w-full border border-red-500/30 bg-card p-5 shadow-2xl sm:max-w-lg sm:rounded-lg" role="dialog"><h2 className="text-lg font-semibold">{tk("artifacts.deleteTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{tk("artifacts.deleteDescription", { title: artifact.title })}</p><div className="mt-5 flex flex-wrap justify-end gap-2"><Button className="min-h-11" variant="outline" onClick={onClose}>{tk("artifacts.cancel")}</Button><Button className="min-h-11" disabled={busy} variant="destructive" onClick={onConfirm}>{tk("artifacts.confirmDelete")}</Button></div></section></div>;
}
