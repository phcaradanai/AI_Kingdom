import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/stores/authStore";

export function SecurityPage() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  return (
    <>
      <PageHeader eyebrow="Security" title="Session and permissions" description="Review the active session and current royal access level." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="mt-4 font-display text-xl">Active Session</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-border pb-3">
              <dt className="text-muted-foreground">Access Token</dt>
              <dd>Short-lived JWT</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border pb-3">
              <dt className="text-muted-foreground">Refresh Token</dt>
              <dd>Server-revocable session</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Role</dt>
              <dd>{user?.role?.replace("_", " ")}</dd>
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
      </div>
    </>
  );
}
