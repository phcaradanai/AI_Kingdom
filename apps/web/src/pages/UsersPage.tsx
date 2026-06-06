import { useEffect, useState, type FormEvent } from "react";
import { UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { PublicUser, UserRole } from "@/types/api";

const roles: UserRole[] = ["KING", "CROWN_PRINCE", "MINISTER", "SCRIBE"];

export function UsersPage() {
  const currentUser = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [form, setForm] = useState({ email: "", displayName: "", password: "", role: "SCRIBE" as UserRole });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (currentUser?.role === "KING") void loadUsers();
  }, [currentUser?.role]);

  async function loadUsers() {
    setIsLoading(true);
    try {
      const response = await api.users();
      setUsers(response.users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users");
    } finally {
      setIsLoading(false);
    }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await api.createUser({ ...form, isActive: true });
      setUsers((items) => [response.user, ...items]);
      setForm({ email: "", displayName: "", password: "", role: "SCRIBE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create user");
    }
  }

  async function deactivateUser(user: PublicUser) {
    setError(null);
    try {
      await api.deleteUser(user.id);
      setUsers((items) => items.map((item) => (item.id === user.id ? { ...item, isActive: false } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to deactivate user");
    }
  }

  if (currentUser?.role !== "KING") {
    return (
      <>
        <PageHeader eyebrow="Users" title="Access restricted" description="Only the King can manage royal accounts." />
        <Card>
          <p className="text-sm text-muted-foreground">Your current role does not include user administration.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Users" title="Royal account management" description="Create and deactivate users for role-based access to the kingdom." />
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Card>
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="mt-4 font-display text-xl">Create User</h2>
          <form className="mt-4 space-y-3" onSubmit={createUser}>
            <Input required type="email" placeholder="email@kingdom.local" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <Input required placeholder="Display name" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
            <Input required type="password" placeholder="Strong password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            <select className="h-11 w-full rounded-md border border-border bg-input px-3 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role.replace("_", " ")}
                </option>
              ))}
            </select>
            {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
            <Button className="w-full" disabled={isLoading}>
              Create Account
            </Button>
          </form>
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Users className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-display text-xl">Accounts</h2>
            </div>
            <span className="text-xs text-muted-foreground">{users.length} users</span>
          </div>
          <div className="mt-4 space-y-3">
            {users.map((user) => (
              <div key={user.id} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold">{user.displayName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{user.email}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge label={user.role.replace("_", " ")} />
                    <Badge label={user.isActive ? "Active" : "Inactive"} muted={!user.isActive} />
                  </div>
                </div>
                <Button variant="outline" disabled={!user.isActive || user.id === currentUser.id} onClick={() => void deactivateUser(user)}>
                  Deactivate
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function Badge({ label, muted = false }: { label: string; muted?: boolean }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs ${muted ? "border-border bg-muted text-muted-foreground" : "border-primary/40 bg-primary/10 text-primary"}`}>{label}</span>;
}
