import { FormEvent, useState } from "react";
import { Cpu, Power, Save } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { AIProviderDto } from "@/types/api";

export function ProvidersPage() {
  const providers = useKingdomStore((state) => state.providers);
  const updateProvider = useKingdomStore((state) => state.updateProvider);
  const [drafts, setDrafts] = useState<Record<string, Pick<AIProviderDto, "defaultModel" | "priority" | "costTier">>>({});

  function draftFor(provider: AIProviderDto) {
    return drafts[provider.id] ?? { defaultModel: provider.defaultModel, priority: provider.priority, costTier: provider.costTier };
  }

  async function save(event: FormEvent, provider: AIProviderDto) {
    event.preventDefault();
    await updateProvider(provider.id, draftFor(provider));
  }

  return (
    <>
      <PageHeader
        eyebrow="Provider Registry"
        title="AI providers"
        description="Manage active providers, routing priority, default models, cost tiers, and public capabilities."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {providers.map((provider) => {
          const draft = draftFor(provider);
          return (
            <Card key={provider.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-primary" />
                    <h2 className="font-display text-xl">{provider.name}</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{provider.type}</p>
                </div>
                <Button variant={provider.isActive ? "primary" : "outline"} onClick={() => void updateProvider(provider.id, { isActive: !provider.isActive })}>
                  <Power className="h-4 w-4" />
                  {provider.isActive ? "Active" : "Inactive"}
                </Button>
              </div>

              <form className="mt-5 space-y-4" onSubmit={(event) => void save(event, provider)}>
                <Input
                  value={draft.defaultModel}
                  onChange={(event) => setDrafts({ ...drafts, [provider.id]: { ...draft, defaultModel: event.target.value } })}
                  placeholder="Default model"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    type="number"
                    value={draft.priority}
                    onChange={(event) => setDrafts({ ...drafts, [provider.id]: { ...draft, priority: Number(event.target.value) } })}
                    placeholder="Priority"
                  />
                  <select
                    className="h-10 rounded-md border border-border bg-input px-3 text-sm"
                    value={draft.costTier}
                    onChange={(event) => setDrafts({ ...drafts, [provider.id]: { ...draft, costTier: event.target.value as AIProviderDto["costTier"] } })}
                  >
                    {["FREE", "LOW", "MEDIUM", "HIGH", "PREMIUM"].map((tier) => <option key={tier} value={tier}>{tier}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-2 py-1">{provider.hasCredentials ? "env credentials" : "no env credentials"}</span>
                  {provider.supportsChat ? <span className="rounded-full border border-border px-2 py-1">chat</span> : null}
                  {provider.supportsTools ? <span className="rounded-full border border-border px-2 py-1">tools</span> : null}
                  {provider.supportsVision ? <span className="rounded-full border border-border px-2 py-1">vision</span> : null}
                  {provider.supportsJsonMode ? <span className="rounded-full border border-border px-2 py-1">json</span> : null}
                </div>
                <Button>
                  <Save className="h-4 w-4" />
                  Save
                </Button>
              </form>
            </Card>
          );
        })}
      </div>
    </>
  );
}
