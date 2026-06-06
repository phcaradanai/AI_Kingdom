import { Crown } from "lucide-react";
import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/authStore";

export function LoginPage() {
  const [email, setEmail] = useState("king@aikingdom.local");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to enter the kingdom");
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-primary/50 bg-primary/10">
          <Crown className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mt-5 text-center font-display text-3xl text-primary">AI Kingdom</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">Enter the royal command center.</p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
          />
          {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
          <Button className="w-full" disabled={isLoading}>
            {isLoading ? "Opening gates..." : "Enter Kingdom"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
