import { Search, SlidersHorizontal } from "lucide-react";
import { useTk } from "@/lib/i18n";
import type { LivingAgentsController } from "./useLivingAgentsController";

export function LivingAgentsToolbar({ controller }: { controller: LivingAgentsController }) {
  const tk = useTk();
  return (
    <div className="grid min-w-0 gap-2 border-y border-border py-3 sm:grid-cols-[minmax(220px,1fr)_minmax(160px,0.45fr)_minmax(160px,0.45fr)]">
      <label className="relative min-w-0">
        <span className="sr-only">{tk("livingAgents.search")}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input className="min-h-11 w-full min-w-0 rounded-md border border-border bg-input pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-primary" placeholder={tk("livingAgents.searchPlaceholder")} value={controller.search} onChange={(event) => controller.setSearch(event.target.value)} />
      </label>
      <label className="relative min-w-0">
        <span className="sr-only">{tk("livingAgents.filter.state")}</span>
        <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <select aria-label={tk("livingAgents.filter.state")} className="min-h-11 w-full min-w-0 appearance-none rounded-md border border-border bg-input pl-9 pr-8 text-sm outline-none transition focus:ring-2 focus:ring-primary" value={controller.stateFilter} onChange={(event) => controller.setStateFilter(event.target.value as typeof controller.stateFilter)}>
          {(["all", "active", "attention", "available", "inactive"] as const).map((value) => <option key={value} value={value}>{tk(`livingAgents.filter.state.${value}`)}</option>)}
        </select>
      </label>
      <label className="min-w-0">
        <span className="sr-only">{tk("livingAgents.filter.role")}</span>
        <select aria-label={tk("livingAgents.filter.role")} className="min-h-11 w-full min-w-0 rounded-md border border-border bg-input px-3 text-sm outline-none transition focus:ring-2 focus:ring-primary" value={controller.roleFilter} onChange={(event) => controller.setRoleFilter(event.target.value)}>
          <option value="all">{tk("livingAgents.filter.role.all")}</option>
          {controller.roles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}
        </select>
      </label>
    </div>
  );
}
