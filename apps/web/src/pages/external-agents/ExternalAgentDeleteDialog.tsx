import { Trash2, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import type { ExternalAgentsController } from "./useExternalAgentsController";

export function ExternalAgentDeleteDialog({ controller }: { controller: ExternalAgentsController }) {
  const tk = useTk();
  const target = controller.deleteTarget!;
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  const title = tk("externalAgents.deleteTitle", { name: target.name });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="presentation"><section aria-label={title} aria-modal="true" className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-2xl" role="dialog"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{tk("externalAgents.deleteDescription")}</p></div><button aria-label={tk("externalAgents.deleteCancel")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground" onClick={() => controller.setDeleteTarget(null)} type="button"><X className="h-4 w-4" /></button></div><div className="mt-5 flex flex-wrap justify-end gap-2"><Button className="min-h-11" onClick={() => controller.setDeleteTarget(null)} variant="outline">{tk("externalAgents.deleteCancel")}</Button><Button className="min-h-11" onClick={() => void controller.confirmDelete()} variant="destructive"><Trash2 className="h-4 w-4" />{tk("externalAgents.deleteConfirm")}</Button></div></section></div>;
}
