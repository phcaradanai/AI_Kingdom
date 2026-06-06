import { Activity, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

type HealthStatus = "checking" | "ok" | "error";

function decodeJwtExp(token: string | null): Date | null {
  if (!token) return null;
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const payload = JSON.parse(atob(segment)) as { exp?: number };
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

function StatusDot({ status }: { status: HealthStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        status === "ok" ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-yellow-500 animate-pulse"
      )}
    />
  );
}

export function SecurityPage() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [apiStatus, setApiStatus] = useState<HealthStatus>("checking");
  const [dbStatus, setDbStatus] = useState<HealthStatus>("checking");

  const API_URL = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
  const baseUrl = API_URL.replace(/\/api$/, "");

  useEffect(() => {
    fetch(`${baseUrl}/health`)
      .then((r) => setApiStatus(r.ok ? "ok" : "error"))
      .catch(() => setApiStatus("error"));
    fetch(`${baseUrl}/health/db`)
      .then((r) => setDbStatus(r.ok ? "ok" : "error"))
      .catch(() => setDbStatus("error"));
  }, [baseUrl]);

  const tokenExpiry = decodeJwtExp(token);
  const tokenExpired = tokenExpiry ? tokenExpiry < new Date() : false;

  return (
    <>
      <PageHeader eyebrow="Security" title="Session and permissions" description="Review the active session, current royal access level, and kingdom operational status." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="mt-4 font-display text-xl">Active Session</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-border pb-3">
              <dt className="text-muted-foreground">Access Token</dt>
              <dd className={cn(tokenExpired ? "text-red-400" : "text-foreground")}>
                {token ? (tokenExpired ? "Expired" : "Valid") : "None"}
                {tokenExpiry && !tokenExpired && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    expires {tokenExpiry.toLocaleTimeString()}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border pb-3">
              <dt className="text-muted-foreground">Refresh Token</dt>
              <dd>{refreshToken ? "Active session" : "None"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Role</dt>
              <dd>{user?.role?.replace("_", " ") ?? "—"}</dd>
            </div>
          </dl>
          <Button
            className="mt-5"
            variant="outline"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            End Session
          </Button>
        </Card>

        <Card>
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-4 font-display text-xl">Role Permissions</h2>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>KING: full kingdom administration, agents, settings, users, archives, and commands.</p>
            <p>CROWN PRINCE: tasks, council records, reports, and memory.</p>
            <p>MINISTER: tasks and reports.</p>
            <p>SCRIBE: read-only council, reports, memory, and task records.</p>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="mt-4 font-display text-xl">Kingdom Operational Status</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <HealthRow label="API Service" status={apiStatus} okLabel="Reachable" />
            <HealthRow label="Database" status={dbStatus} okLabel="Reachable" />
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">Current Role</dt>
              <dd className="font-medium">{user?.role?.replace("_", " ") ?? "—"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">Session</dt>
              <dd className={cn("font-medium", refreshToken ? "text-green-400" : "text-muted-foreground")}>
                {refreshToken ? "Active" : "None"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}

function HealthRow({ label, status, okLabel }: { label: string; status: HealthStatus; okLabel: string }) {
  const text = status === "checking" ? "Checking…" : status === "ok" ? okLabel : "Unreachable";
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2 font-medium">
        <StatusDot status={status} />
        {text}
      </dd>
    </div>
  );
}
