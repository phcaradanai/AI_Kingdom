import { Activity, Archive, Bell, BookOpen, Bot, Brain, ChevronDown, ClipboardList, Coins, Cpu, Crown, Eye, FolderKanban, Inbox, Landmark, Languages, LineChart, LogOut, Menu, MessageSquare, MonitorPlay, PanelLeftClose, PanelLeftOpen, Scroll, ScrollText, Settings, Shield, Sparkles, UserCircle, Users, UsersRound, Vault, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { SUPPORTED_LANGUAGES, hasStoredLanguagePreference, normalizeLanguage, useI18n, type LanguageCode } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { UserRole } from "@/types/api";

// Navigation is grouped by PURPOSE (what the King is trying to do), not by internal
// data model. Every `to` path and `roles` array is preserved from the prior nav — only
// the grouping and group names changed — so all existing routes keep working.
//
// M20 Phase 1 (Mission Control Consolidation): the five overlapping summary surfaces the
// IA audit flagged — /dashboard, /inbox, /kingdom/operations, /royal-brief, /living-loop —
// are collapsed into one read-only "Mission Control" group (Overview / Action Queue /
// Operations / Royal Brief / Living Loop). This also surfaces /royal-brief, which existed
// as a route but was unreachable from the sidebar. Durable-record routes keep their owning
// groups. No route renames here — those are deferred to Phase 2.
const navCategories = [
  {
    name: "Mission Control",
    icon: Crown,
    items: [
      { to: "/dashboard", label: "Overview", icon: Crown, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/inbox", label: "Action Queue", icon: Zap, roles: ["KING", "CROWN_PRINCE"] },
      { to: "/kingdom/operations", label: "Operations", icon: MonitorPlay, roles: ["KING", "CROWN_PRINCE"] },
      { to: "/royal-brief", label: "Royal Brief", icon: ScrollText, roles: ["KING", "CROWN_PRINCE"] },
      { to: "/living-loop", label: "Living Loop", icon: Sparkles, roles: ["KING"] },
    ]
  },
  {
    name: "Command",
    icon: Scroll,
    items: [
      { to: "/throne-room", label: "Throne Room", icon: Scroll, roles: ["KING", "CROWN_PRINCE", "MINISTER"] },
      { to: "/council", label: "Council", icon: UsersRound, roles: ["KING", "CROWN_PRINCE", "SCRIBE"] },
      { to: "/strategy", label: "Strategy Ledger", icon: LineChart, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
    ]
  },
  {
    name: "Work",
    icon: FolderKanban,
    items: [
      { to: "/projects", label: "Projects", icon: FolderKanban, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/work-orders", label: "Work Orders", icon: ClipboardList, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/project-inbox", label: "Project Inbox", icon: Inbox, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/artifacts", label: "Artifacts", icon: Archive, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/reports", label: "Reports", icon: ScrollText, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
    ]
  },
  {
    name: "Knowledge",
    icon: Brain,
    items: [
      { to: "/memory", label: "Memory", icon: Vault, roles: ["KING", "CROWN_PRINCE", "SCRIBE"] },
      { to: "/agent-chat", label: "Agent Chat", icon: MessageSquare, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/knowledge-lab", label: "Knowledge Lab", icon: Brain, roles: ["KING", "CROWN_PRINCE", "MINISTER"] },
      { to: "/charter", label: "Charter", icon: BookOpen, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/vision", label: "Vision", icon: Eye, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/living-agents", label: "Living Agents", icon: Activity, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
    ]
  },
  {
    name: "Agents & Models",
    icon: Bot,
    items: [
      { to: "/agents", label: "Agents", icon: Shield, roles: ["KING"] },
      { to: "/external-agents", label: "External Agents", icon: Bot, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/providers", label: "Providers", icon: Cpu, roles: ["KING"] },
      { to: "/routing", label: "Routing", icon: Landmark, roles: ["KING"] },
    ]
  },
  {
    name: "System",
    icon: Settings,
    items: [
      { to: "/automation-jobs", label: "Automation Jobs", icon: Activity, roles: ["KING"] },
      { to: "/treasury", label: "Treasury", icon: Coins, roles: ["KING"] },
      { to: "/audit", label: "Audit Log", icon: ClipboardList, roles: ["KING"] },
      { to: "/settings", label: "Settings", icon: Settings, roles: ["KING"] },
      { to: "/users", label: "Users", icon: Users, roles: ["KING"] },
      { to: "/notices", label: "Notices", icon: Bell, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/matters", label: "Matters", icon: Landmark, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/security", label: "Security", icon: Shield, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/profile", label: "Profile", icon: UserCircle, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
    ]
  }
];

const WIDE_ROUTES = ["/dashboard", "/inbox", "/kingdom/operations", "/royal-brief", "/living-loop", "/work-orders", "/automation-jobs", "/agents", "/treasury"];
const COMPACT_ROUTES = ["/profile", "/security", "/charter", "/vision"];
const SIDEBAR_COLLAPSED_STORAGE_KEY = "ai-kingdom-sidebar-collapsed";
const INBOX_POLL_INTERVAL_MS = 30_000;

function routeMatches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function contentWidth(pathname: string) {
  if (COMPACT_ROUTES.some((route) => routeMatches(pathname, route))) return "max-w-[880px]";
  if (WIDE_ROUTES.some((route) => routeMatches(pathname, route))) return "max-w-[1480px]";
  return "max-w-7xl";
}

export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const clearSession = useAuthStore((state) => state.clearSession);
  const refresh = useKingdomStore((state) => state.refresh);
  const settings = useKingdomStore((state) => state.settings ?? []);
  const navigate = useNavigate();
  const location = useLocation();
  const [inboxPriorityCount, setInboxPriorityCount] = useState(0);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [desktopNavigationCollapsed, setDesktopNavigationCollapsed] = useState(
    () => globalThis.localStorage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
  );
  const { language, setLanguage, t } = useI18n();

  const visibleCategories = navCategories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => user && item.roles.includes(user.role as UserRole))
    }))
    .filter((category) => category.items.length > 0);
  const activeCategory = visibleCategories.find((category) => category.items.some((item) => routeMatches(location.pathname, item.to)));
  const activeItem = activeCategory?.items.find((item) => routeMatches(location.pathname, item.to));
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set([activeCategory?.name ?? "Mission Control"]));

  useEffect(() => {
    void refresh();
  }, [refresh, user?.role]);

  useEffect(() => {
    const configuredLanguage = settings.find((setting) => setting.key === "UI_LANGUAGE")?.value;
    if (!configuredLanguage || hasStoredLanguagePreference()) return;
    setLanguage(normalizeLanguage(configuredLanguage), { persist: false });
  }, [setLanguage, settings]);

  useEffect(() => {
    let cancelled = false;
    if (user?.role !== "KING" && user?.role !== "CROWN_PRINCE") {
      setInboxPriorityCount(0);
      return;
    }

    const loadPriorityCount = () => {
      api.getNextActions({ limit: 1 })
        .then((result) => {
          if (!cancelled) setInboxPriorityCount(result.summary.criticalCount + result.summary.highCount);
        })
        .catch(() => {
          if (!cancelled) setInboxPriorityCount(0);
        });
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadPriorityCount();
    };

    loadPriorityCount();
    const intervalId = window.setInterval(loadPriorityCount, INBOX_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [user?.role]);

  useEffect(() => {
    globalThis.localStorage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(desktopNavigationCollapsed));
  }, [desktopNavigationCollapsed]);

  useEffect(() => {
    const expire = () => {
      clearSession();
      navigate("/login");
    };
    window.addEventListener("ai-kingdom-session-expired", expire);
    return () => window.removeEventListener("ai-kingdom-session-expired", expire);
  }, [clearSession, navigate]);

  useEffect(() => {
    if (activeCategory) {
      setOpenCategories((current) => new Set([...current, activeCategory.name]));
    }
    setMobileNavigationOpen(false);
  }, [activeCategory?.name, location.pathname]);

  useEffect(() => {
    if (!mobileNavigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavigationOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavigationOpen]);

  const toggleCategory = (name: string) => {
    setOpenCategories((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const signOut = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        aria-label={t("Desktop navigation")}
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-card shadow-[12px_0_32px_rgba(0,0,0,0.12)] transition-[width] duration-200 motion-reduce:transition-none lg:flex",
          desktopNavigationCollapsed ? "w-20" : "w-64"
        )}
        data-collapsed={desktopNavigationCollapsed}
      >
        <Brand t={t} collapsed={desktopNavigationCollapsed} />
        <button
          type="button"
          className="absolute right-[-14px] top-6 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-md transition-[border-color,color,transform] duration-150 hover:border-primary/50 hover:text-primary active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background motion-reduce:transition-none"
          aria-label={t(desktopNavigationCollapsed ? "Expand navigation" : "Collapse navigation")}
          aria-expanded={!desktopNavigationCollapsed}
          title={t(desktopNavigationCollapsed ? "Expand navigation" : "Collapse navigation")}
          onClick={() => setDesktopNavigationCollapsed((current) => !current)}
        >
          {desktopNavigationCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
        <NavigationGroups
          categories={visibleCategories}
          collapsed={desktopNavigationCollapsed}
          inboxPriorityCount={inboxPriorityCount}
          openCategories={openCategories}
          onToggle={toggleCategory}
          t={t}
        />
        <AccountControls
          collapsed={desktopNavigationCollapsed}
          displayName={user?.displayName}
          email={user?.email}
          role={user?.role}
          language={language}
          onLanguageChange={(value) => setLanguage(value)}
          onSignOut={signOut}
          t={t}
        />
      </aside>

      {mobileNavigationOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/65"
            aria-label="Close navigation"
            onClick={() => setMobileNavigationOpen(false)}
          />
          <aside className="relative flex h-full w-[min(88vw,320px)] flex-col border-r border-border bg-card shadow-2xl" role="dialog" aria-modal="true" aria-label="Application navigation">
            <div className="flex items-center justify-between border-b border-border pr-3">
              <Brand t={t} compact />
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close navigation" onClick={() => setMobileNavigationOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavigationGroups
              categories={visibleCategories}
              inboxPriorityCount={inboxPriorityCount}
              openCategories={openCategories}
              onToggle={toggleCategory}
              t={t}
            />
            <AccountControls
              displayName={user?.displayName}
              email={user?.email}
              role={user?.role}
              language={language}
              onLanguageChange={(value) => setLanguage(value)}
              onSignOut={signOut}
              t={t}
            />
          </aside>
        </div>
      )}

      <main className={cn(
        "flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-200 motion-reduce:transition-none",
        desktopNavigationCollapsed ? "lg:pl-20" : "lg:pl-64"
      )}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 lg:hidden">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-muted-foreground">{t(activeCategory?.name ?? "Mission Control")}</div>
            <div className="truncate text-sm font-semibold text-foreground">{t(activeItem?.label ?? "Overview")}</div>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground hover:border-primary/50 hover:text-primary"
            aria-label="Open navigation"
            aria-expanded={mobileNavigationOpen}
            onClick={() => setMobileNavigationOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>
        <div className={cn("mx-auto w-full flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8", contentWidth(location.pathname))}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

type VisibleCategory = {
  name: string;
  icon: typeof navCategories[number]["icon"];
  items: typeof navCategories[number]["items"];
};

function Brand({ t, compact = false, collapsed = false }: { t: (text: string) => string; compact?: boolean; collapsed?: boolean }) {
  return (
    <div className={cn(
      "flex shrink-0 items-center border-b border-border",
      compact ? "gap-3 border-b-0 px-4 py-4" : collapsed ? "justify-center px-3 py-5" : "gap-3 px-5 py-5 pr-10"
    )}>
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/35 bg-primary/10 transition-[border-color,background-color,transform] duration-150 hover:border-primary/55 hover:bg-primary/15 motion-reduce:transition-none">
        <Crown className="h-5 w-5 text-primary" />
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-400 motion-safe:animate-pulse" title={t("Live sync")} />
      </div>
      <div className={cn("min-w-0", collapsed && "sr-only")}>
        <div className="truncate font-display text-base font-bold text-primary">{t("AI Kingdom")}</div>
        <div className="truncate text-[11px] font-medium text-muted-foreground">{t("Royal Command")}</div>
      </div>
    </div>
  );
}

function NavigationGroups({ categories, collapsed = false, inboxPriorityCount, openCategories, onToggle, t }: { categories: VisibleCategory[]; collapsed?: boolean; inboxPriorityCount: number; openCategories: Set<string>; onToggle: (name: string) => void; t: (text: string) => string }) {
  return (
    <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")} aria-label="Primary navigation">
      <div className="space-y-1">
        {categories.map((category) => {
          const open = openCategories.has(category.name);
          const CategoryIcon = category.icon;
          return (
            <div key={category.name} className="border-b border-border/60 py-1 last:border-b-0">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center rounded-md text-xs font-semibold text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted/60 hover:text-foreground active:scale-[0.98] motion-reduce:transition-none",
                  collapsed ? "h-7 justify-center px-0" : "h-9 justify-between px-2 text-left"
                )}
                aria-expanded={open}
                aria-label={`${t(category.name)} navigation`}
                title={collapsed ? t(category.name) : undefined}
                onClick={() => onToggle(category.name)}
              >
                {collapsed ? <CategoryIcon className="h-3 w-3 opacity-60" /> : <span className="min-w-0 truncate">{t(category.name)}</span>}
                {!collapsed && <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />}
              </button>
              {open && (
                <div className="space-y-0.5 pb-2 pt-1">
                  {category.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      aria-label={t(item.label)}
                      title={collapsed ? t(item.label) : undefined}
                      className={({ isActive }) => cn(
                        "relative flex min-h-9 items-center rounded-md py-2 text-sm font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none",
                        collapsed ? "justify-center px-0 hover:scale-[1.04]" : "gap-3 px-2.5",
                        isActive
                          ? "bg-primary/10 text-primary shadow-[inset_2px_0_0_0_hsl(var(--primary))]"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0 opacity-80" />
                      <span className={collapsed ? "sr-only" : "min-w-0 flex-1 leading-5"}>{t(item.label)}</span>
                      {item.to === "/inbox" && inboxPriorityCount > 0 && (
                        <span
                          className={cn(
                            "border border-amber-500/35 bg-amber-500/10 text-[10px] font-semibold leading-none text-amber-300",
                            collapsed ? "absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1" : "ml-auto rounded-full px-2 py-0.5"
                          )}
                          aria-live="polite"
                        >
                          {inboxPriorityCount > 99 ? "99+" : inboxPriorityCount}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function AccountControls({ collapsed = false, displayName, email, role, language, onLanguageChange, onSignOut, t }: { collapsed?: boolean; displayName?: string; email?: string; role?: string; language: LanguageCode; onLanguageChange: (value: LanguageCode) => void; onSignOut: () => Promise<void>; t: (text: string) => string }) {
  if (collapsed) {
    const initial = displayName?.trim().charAt(0).toUpperCase() || "K";
    return (
      <div className="flex shrink-0 flex-col items-center gap-2 border-t border-border bg-background/50 p-2">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-sm font-bold text-primary"
          title={[displayName, email, t(formatRole(role))].filter(Boolean).join(" · ")}
          aria-label={[displayName, t(formatRole(role))].filter(Boolean).join(", ")}
        >
          {initial}
        </div>
        <LanguageSelect compact value={language} label={t("Display language")} onChange={onLanguageChange} />
        <Button className="h-10 w-10 px-0" variant="ghost" onClick={() => void onSignOut()} aria-label={t("Sign out")} title={t("Sign out")}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-border bg-background/50 p-4">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{email}</div>
        <div className="mt-2 inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          <Crown className="mr-1.5 h-3 w-3" />
          {t(formatRole(role))}
        </div>
      </div>
      <LanguageSelect value={language} label={t("Display language")} onChange={onLanguageChange} />
      <Button className="mt-3 h-9 w-full text-xs" variant="ghost" onClick={() => void onSignOut()}>
        <LogOut className="h-3.5 w-3.5" />
        {t("Sign out")}
      </Button>
    </div>
  );
}

function formatRole(role?: string) {
  return role ? role.replace("_", " ") : "Unknown";
}

function LanguageSelect({ value, label, onChange, compact = false }: { value: LanguageCode; label: string; onChange: (value: LanguageCode) => void; compact?: boolean }) {
  if (compact) {
    return (
      <label className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary" title={label}>
        <Languages className="h-4 w-4" />
        <select
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(normalizeLanguage(event.target.value))}
        >
          {SUPPORTED_LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>{language.nativeLabel}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="mt-3 flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs text-muted-foreground">
      <Languages className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="sr-only">{label}</span>
      <select
        className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-foreground outline-none"
        value={value}
        onChange={(event) => onChange(normalizeLanguage(event.target.value))}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
