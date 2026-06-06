import { Archive, Bell, BookOpen, Bot, ClipboardList, Coins, Cpu, Crown, Eye, FolderKanban, Inbox, Landmark, LogOut, Scroll, ScrollText, Settings, Shield, Sparkles, UserCircle, Users, UsersRound, Vault } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { UserRole } from "@/types/api";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: Crown, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/throne-room", label: "Royal Command", icon: Scroll, roles: ["KING", "CROWN_PRINCE", "MINISTER"] },
  { to: "/notices", label: "Notices", icon: Bell, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/matters", label: "Matters", icon: Landmark, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/projects", label: "Projects", icon: FolderKanban, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/project-inbox", label: "Project Inbox", icon: Inbox, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/artifacts", label: "Artifacts", icon: Archive, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/council", label: "Council", icon: UsersRound, roles: ["KING", "CROWN_PRINCE", "SCRIBE"] },
  { to: "/charter", label: "Charter", icon: BookOpen, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/vision", label: "Vision", icon: Eye, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/agents", label: "Agents", icon: Shield, roles: ["KING"] },
  { to: "/external-agents", label: "External Agents", icon: Bot, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/work-orders", label: "Work Orders", icon: ClipboardList, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/reports", label: "Reports", icon: ScrollText, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/memory", label: "Memory", icon: Vault, roles: ["KING", "CROWN_PRINCE", "SCRIBE"] },
  { to: "/treasury", label: "Treasury", icon: Coins, roles: ["KING"] },
  { to: "/providers", label: "Providers", icon: Cpu, roles: ["KING"] },
  { to: "/audit", label: "Audit Log", icon: ClipboardList, roles: ["KING"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["KING"] },
  { to: "/users", label: "Users", icon: Users, roles: ["KING"] },
  { to: "/profile", label: "Profile", icon: UserCircle, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] },
  { to: "/security", label: "Security", icon: Shield, roles: ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"] }
];

export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const clearSession = useAuthStore((state) => state.clearSession);
  const refresh = useKingdomStore((state) => state.refresh);
  const navigate = useNavigate();
  const visibleNavItems = navItems.filter((item) => user && item.roles.includes(user.role as UserRole));

  useEffect(() => {
    void refresh();
  }, [refresh, user?.role]);

  useEffect(() => {
    const expire = () => {
      clearSession();
      navigate("/login");
    };
    window.addEventListener("ai-kingdom-session-expired", expire);
    return () => window.removeEventListener("ai-kingdom-session-expired", expire);
  }, [clearSession, navigate]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-border bg-background/80 backdrop-blur-xl lg:flex">
        {/* Brand */}
        <div className="flex shrink-0 items-center gap-3 px-5 pt-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/40 bg-primary/10">
            <Crown className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="font-display text-lg text-primary">AI Kingdom</div>
            <div className="text-xs text-muted-foreground">Royal Command Center</div>
          </div>
        </div>

        {/* Scrollable nav */}
        <nav className="mt-6 flex-1 overflow-y-auto px-3 pb-2">
          <div className="space-y-0.5">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition",
                    isActive ? "bg-primary/15 text-primary" : "hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Pinned user card */}
        <div className="shrink-0 px-5 pb-5 pt-3">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="text-sm font-semibold">{user?.displayName}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{user?.email}</div>
            <div className="mt-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {formatRole(user?.role)}
            </div>
            <Button
              className="mt-4 w-full"
              variant="outline"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-border bg-background/72 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-display text-primary">
              <Crown className="h-5 w-5" />
              AI Kingdom
            </div>
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold",
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function formatRole(role?: string) {
  return role ? role.replace("_", " ") : "Unknown";
}
