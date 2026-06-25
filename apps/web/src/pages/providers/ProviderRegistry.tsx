import { Cpu, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import {
  getModelDisplayName,
  getProviderDisplayName,
  getProviderModeBadge,
} from "@/lib/providerDisplay";
import { cn } from "@/lib/utils";
import { ProviderHealthBadge, ProviderReadinessBadge } from "./ProviderBadges";
import {
  getProviderHealth,
  getProviderReadiness,
  type ProviderFilter,
} from "./providerModels";
import type { ProvidersController } from "./useProvidersController";

const FILTERS: ProviderFilter[] = ["ALL", "READY", "ATTENTION", "INACTIVE"];

export function ProviderRegistry({
  controller,
}: {
  controller: ProvidersController;
}) {
  const tk = useTk();
  return (
    <aside
      className={cn(
        "min-w-0 border border-border bg-card/35",
        controller.mobileView === "detail" ? "hidden lg:block" : "block",
      )}
    >
      <div className="border-b border-border p-3">
        <label className="relative block">
          <span className="sr-only">{tk("providers.search")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={tk("providers.search")}
            className="min-h-11 pl-9"
            onChange={(event) => controller.setSearch(event.target.value)}
            placeholder={tk("providers.searchPlaceholder")}
            value={controller.search}
          />
        </label>
        <div
          aria-label={tk("providers.filters.aria")}
          className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-2"
          role="group"
        >
          {FILTERS.map((filter) => (
            <button
              aria-pressed={controller.filter === filter}
              className={cn(
                "min-h-11 px-2 text-xs font-semibold transition-colors",
                controller.filter === filter
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
              key={filter}
              onClick={() => controller.setFilter(filter)}
              type="button"
            >
              {tk(`providers.filter.${filter}`)}
            </button>
          ))}
        </div>
      </div>

      <nav aria-label={tk("providers.registry.aria")} className="divide-y divide-border">
        {controller.filteredProviders.map((provider) => {
          const readiness = getProviderReadiness(provider, controller.health);
          const health = getProviderHealth(provider, controller.health);
          const selected = provider.id === controller.selected?.id;
          return (
            <button
              aria-label={tk("providers.select", {
                name: getProviderDisplayName(provider),
              })}
              aria-pressed={selected}
              className={cn(
                "flex min-h-[76px] w-full min-w-0 items-center gap-3 px-3 py-2 text-left transition-colors",
                selected
                  ? "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]"
                  : "hover:bg-muted/35",
              )}
              key={provider.id}
              onClick={() => controller.selectProvider(provider.id)}
              type="button"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-primary/25 bg-primary/8 text-primary">
                <Cpu className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {getProviderDisplayName(provider)}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {getProviderModeBadge(provider)} · {getModelDisplayName(provider.defaultModel)}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <ProviderReadinessBadge readiness={readiness} />
                  <ProviderHealthBadge status={health?.healthStatus} />
                </span>
              </span>
              <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                <SlidersHorizontal className="ml-auto h-3.5 w-3.5" />
                <span className="mt-1 block tabular-nums">#{provider.priority}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {controller.filteredProviders.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          <Cpu className="mx-auto mb-2 h-5 w-5" />
          {tk("providers.empty")}
        </div>
      ) : null}
    </aside>
  );
}
