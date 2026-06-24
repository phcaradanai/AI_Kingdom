import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PROFILE_SECTIONS } from "./profileModels";
import type { ProfileSection } from "./profileModels";

export function ProfileNavigation({
  active,
  onChange,
}: {
  active: ProfileSection;
  onChange: (section: ProfileSection) => void;
}) {
  const tk = useTk();
  return (
    <nav
      aria-label={tk("agentProfile.sections.aria")}
      className="grid min-w-0 grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-5"
    >
      {PROFILE_SECTIONS.map(({ id, icon: Icon }) => (
        <button
          aria-pressed={active === id}
          className={cn(
            "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 bg-card/70 px-2 text-center text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary",
            active === id
              ? "bg-primary/12 text-primary"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
          key={id}
          onClick={() => onChange(id)}
          type="button"
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="break-words">
            {tk(`agentProfile.section.${id}`)}
          </span>
        </button>
      ))}
    </nav>
  );
}
