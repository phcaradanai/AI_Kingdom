import { Route, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import { getModelDisplayName, getProviderDisplayName } from "@/lib/providerDisplay";
import { cn } from "@/lib/utils";
import { ChainStatusBadge, HealthDot } from "./RoutingBadges";
import {
  ROUTE_FILTERS,
  getEnabledEntries,
  getProviderForEntry,
  getProviderHealthStatus,
} from "./routingModels";
import type { RoutingController } from "./useRoutingController";

export function RouteChainRegistry({
  controller,
}: {
  controller: RoutingController;
}) {
  const tk = useTk();
  const emptyMessage =
    controller.chains.length === 0 ? tk("routing.emptyAll") : tk("routing.empty");
  return (
    <aside
      className={cn(
        "min-w-0 border border-border bg-card/35",
        controller.mobileView === "detail" ? "hidden lg:block" : "block",
      )}
    >
      <div className="border-b border-border p-3">
        <label className="relative block">
          <span className="sr-only">{tk("routing.search")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={tk("routing.search")}
            className="min-h-11 pl-9"
            onChange={(event) => controller.setSearch(event.target.value)}
            placeholder={tk("routing.searchPlaceholder")}
            value={controller.search}
          />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-5 lg:grid-cols-2">
          {ROUTE_FILTERS.map((filter) => (
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
              {tk(`routing.filter.${filter}`)}
            </button>
          ))}
        </div>
      </div>

      <nav aria-label={tk("routing.registry.aria")} className="divide-y divide-border">
        {controller.filteredChains.map((chain) => {
          const selected = chain.id === controller.selected?.id;
          const enabledEntries = getEnabledEntries(chain);
          const previewEntries = enabledEntries.slice(0, 3);
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "flex min-h-[92px] w-full min-w-0 gap-3 px-3 py-3 text-left transition-colors",
                selected
                  ? "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]"
                  : "hover:bg-muted/35",
              )}
              key={chain.id}
              onClick={() => controller.selectChain(chain.id)}
              type="button"
            >
              <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center border border-primary/25 bg-primary/8 text-primary">
                <Route className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                    {chain.name}
                  </span>
                  <ChainStatusBadge active={chain.isActive} />
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {scopeLabel(chain.scope, tk)} · {chain.taskMode || tk("routing.anyMode")}
                </span>
                <span className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                  {previewEntries.map((entry) => {
                    const provider = getProviderForEntry(entry, controller.providers);
                    return (
                      <span
                        className="inline-flex max-w-full items-center gap-1.5 border border-border bg-background/60 px-1.5 py-1 text-[11px] text-muted-foreground"
                        key={entry.id}
                      >
                        <HealthDot status={getProviderHealthStatus(provider)} />
                        <span className="truncate">
                          {provider?.name ?? getProviderDisplayName(entry.providerId)} · {getModelDisplayName(entry.model)}
                        </span>
                      </span>
                    );
                  })}
                </span>
              </span>
              <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                <span className="block tabular-nums">{chain.entries.length}</span>
                <span className="block">{tk("routing.entries", { count: chain.entries.length })}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {controller.filteredChains.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          <Route className="mx-auto mb-2 h-5 w-5" />
          {emptyMessage}
        </div>
      ) : null}
    </aside>
  );
}

function scopeLabel(scope: string, tk: (key: string) => string) {
  if (scope === "GLOBAL") return tk("routing.scope.GLOBAL");
  if (scope === "TASK_MODE") return tk("routing.scope.TASK_MODE");
  if (scope === "AGENT") return tk("routing.scope.AGENT");
  return tk("routing.scope.CUSTOM");
}
