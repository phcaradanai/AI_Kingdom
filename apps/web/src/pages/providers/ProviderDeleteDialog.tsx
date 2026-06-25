import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { getProviderDisplayName } from "@/lib/providerDisplay";
import type { ProvidersController } from "./useProvidersController";

export function ProviderDeleteDialog({
  controller,
}: {
  controller: ProvidersController;
}) {
  const tk = useTk();
  const target = controller.deleteTarget!;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
    >
      <section
        aria-label={tk("providers.deleteDialog.title")}
        aria-modal="true"
        className="w-full max-w-lg border border-destructive/35 bg-card p-5 shadow-2xl sm:rounded-lg"
        role="alertdialog"
      >
        <ShieldAlert className="h-5 w-5 text-destructive" />
        <h2 className="mt-3 text-lg font-semibold">
          {tk("providers.deleteDialog.title")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {tk("providers.deleteDialog.description", {
            name: getProviderDisplayName(target),
          })}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            className="min-h-11"
            onClick={() => controller.setDeleteTarget(null)}
            variant="outline"
          >
            {tk("providers.cancel")}
          </Button>
          <Button
            className="min-h-11"
            disabled={controller.saving}
            onClick={() => void controller.confirmDelete()}
            variant="destructive"
          >
            {tk("providers.deleteDialog.confirm")}
          </Button>
        </div>
      </section>
    </div>
  );
}
