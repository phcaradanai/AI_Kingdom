import { Activity, Archive, Bell, BookOpen, Bot, Brain, ClipboardList, Coins, Cpu, Crown, Eye, FolderKanban, Inbox, Landmark, LogOut, MonitorPlay, Scroll, ScrollText, Settings, Shield, Sparkles, UserCircle, Users, UsersRound, Vault, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { UserRole } from "@/types/api";

// Navigation is grouped by PURPOSE (what the King is trying to do), not by internal
// data model. Every `to` path and `roles` array is preserved from the prior nav — only
// the grouping and group names changed — so all existing routes keep working.
const navCategories = [
  {
    name: "Kingdom",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: Crown, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/throne-room", label: "Throne Room", icon: Scroll, roles: ["KING", "CROWN_PRINCE", "MINISTER"] },
      { to: "/kingdom/operations", label: "Operations Center", icon: MonitorPlay, roles: ["KING", "CROWN_PRINCE"] },
      { to: "/inbox", label: "Kingdom Inbox", icon: Zap, roles: ["KING", "CROWN_PRINCE"] },
    ]
  },
  {
    name: "Work",
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
    items: [
      { to: "/memory", label: "Memory", icon: Vault, roles: ["KING", "CROWN_PRINCE", "SCRIBE"] },
      { to: "/council", label: "Council", icon: UsersRound, roles: ["KING", "CROWN_PRINCE", "SCRIBE"] },
      { to: "/knowledge-lab", label: "Knowledge Lab", icon: Brain, roles: ["KING", "CROWN_PRINCE", "MINISTER"] },
      { to: "/charter", label: "Charter", icon: BookOpen, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/vision", label: "Vision", icon: Eye, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/living-agents", label: "Living Agents", icon: Activity, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
    ]
  },
  {
    name: "Agents",
    items: [
      { to: "/agents", label: "Agents", icon: Shield, roles: ["KING"] },
      { to: "/external-agents", label: "External Agents", icon: Bot, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
      { to: "/providers", label: "Providers", icon: Cpu, roles: ["KING"] },
      { to: "/routing", label: "Routing", icon: Landmark, roles: ["KING"] },
    ]
  },
  {
    name: "System",
    items: [
      { to: "/automation-jobs", label: "Automation Jobs", icon: Activity, roles: ["KING"] },
      { to: "/living-loop", label: "Living Loop", icon: Activity, roles: ["KING"] },
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

export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const clearSession = useAuthStore((state) => state.clearSession);
  const refresh = useKingdomStore((state) => state.refresh);
  const navigate = useNavigate();
  const [inboxPriorityCount, setInboxPriorityCount] = useState(0);

  const allVisibleNavItems = navCategories.flatMap(c => c.items).filter(item => user && item.roles.includes(user.role as UserRole));

  useEffect(() => {
    void refresh();
  }, [refresh, user?.role]);

  useEffect(() => {
    let cancelled = false;
    if (user?.role !== "KING" && user?.role !== "CROWN_PRINCE") {
      setInboxPriorityCount(0);
      return;
    }

    api.getNextActions({ limit: 1 })
      .then((result) => {
        if (!cancelled) setInboxPriorityCount(result.summary.criticalCount + result.summary.highCount);
      })
      .catch(() => {
        if (!cancelled) setInboxPriorityCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  useEffect(() => {
    const expire = () => {
      clearSession();
      navigate("/login");
    };
    window.addEventListener("ai-kingdom-session-expired", expire);
    return () => window.removeEventListener("ai-kingdom-session-expired", expire);
  }, [clearSession, navigate]);

  return (
    <div className="min-h-screen flex">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-border bg-background/80 backdrop-blur-xl lg:flex z-50">
        {/* Brand */}
        <div className="flex shrink-0 items-center gap-3 px-6 pt-6 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 shadow-[0_0_15px_rgba(214,170,87,0.15)]">
            <Crown className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="font-display text-xl font-bold tracking-wide text-primary">AI Kingdom</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Royal Command</div>
          </div>
        </div>

        {/* Scrollable nav */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {navCategories.map((category) => {
            const visibleItems = category.items.filter((item) => user && item.roles.includes(user.role as UserRole));
            if (visibleItems.length === 0) return null;
            
            return (
              <div key={category.name}>
                <h4 className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
                  {category.name}
                </h4>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200",
                          isActive 
                            ? "bg-primary/15 text-primary shadow-[inset_2px_0_0_0_hsl(var(--primary))]" 
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )
                      }
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", "opacity-80")} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.to === "/inbox" && inboxPriorityCount > 0 && (
                        <span className="ml-auto rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold leading-none text-amber-300">
                          {inboxPriorityCount}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Pinned user card */}
        <div className="shrink-0 border-t border-border/50 bg-background/50 p-4 backdrop-blur-md">
          <div className="rounded-xl border border-border/50 bg-muted/20 p-4 shadow-sm">
            <div className="font-display text-sm font-semibold tracking-wide text-foreground">{user?.displayName}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{user?.email}</div>
            <div className="mt-3 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              <Crown className="mr-1.5 h-3 w-3" />
              {formatRole(user?.role)}
            </div>
            <Button
              className="mt-4 w-full h-8 text-xs bg-muted/40 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
              variant="outline"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 lg:pl-72 flex flex-col min-h-screen">
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl lg:hidden shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-display text-lg font-bold text-primary">
              <Crown className="h-5 w-5" />
              AI Kingdom
            </div>
            <Sparkles className="h-5 w-5 text-primary/70" />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {allVisibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex h-8 shrink-0 items-center gap-2 rounded-full px-4 text-xs font-semibold transition",
                    isActive ? "bg-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )
                }
              >
                <item.icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
                {item.to === "/inbox" && inboxPriorityCount > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] leading-none text-background">
                    {inboxPriorityCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </header>
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function formatRole(role?: string) {
  return role ? role.replace("_", " ") : "Unknown";
}
