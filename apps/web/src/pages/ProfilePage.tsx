import { Crown, Mail, Shield } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/stores/authStore";

export function ProfilePage() {
  const user = useAuthStore((state) => state.user);

  return (
    <>
      <PageHeader eyebrow="Profile" title="Royal identity" description="Review the current account and role used for council access." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Crown className="h-6 w-6 text-primary" />
          <h2 className="mt-4 font-display text-2xl">{user?.displayName}</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Mail className="h-4 w-4 text-primary" />
              <span>{user?.email}</span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Shield className="h-4 w-4 text-primary" />
              <span>{formatRole(user?.role)}</span>
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="font-display text-xl">Access</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Role-based access controls determine which archives, settings, and agent controls appear in the kingdom dashboard.
          </p>
        </Card>
      </div>
    </>
  );
}

function formatRole(role?: string) {
  return role ? role.replace("_", " ") : "Unknown";
}
