import { KeyRound, ServerCog, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { SettingDto } from "@/types/api";

const behaviorKeys = ["AUTO_PROCESS_TASKS", "AUTO_SAVE_MEMORY", "AUTO_GENERATE_REPORTS"];

export function SettingsPage() {
  const settings = useKingdomStore((state) => state.settings);
  const providers = useKingdomStore((state) => state.providers);
  const updateSetting = useKingdomStore((state) => state.updateSetting);
  const groups = {
    AI: settings.filter((setting) => setting.category === "AI"),
    SYSTEM: settings.filter((setting) => setting.category === "SYSTEM"),
    UI: settings.filter((setting) => setting.category === "UI"),
    SECURITY: settings.filter((setting) => setting.category === "SECURITY")
  };

  async function update(key: string, value: string) {
    await updateSetting(key, value);
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Kingdom configuration"
        description="Tune AI provider defaults and system behavior. API keys remain server-only in `.env`."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <SettingsCard icon={<KeyRound className="h-5 w-5 text-primary" />} title="AI Settings" settings={groups.AI} onUpdate={update} />
          <Card>
            <ServerCog className="h-5 w-5 text-primary" />
            <h2 className="mt-4 font-display text-xl">Provider Status</h2>
            <div className="mt-4 space-y-3">
              {providers.map((provider) => (
                <div key={provider.id} className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{provider.name}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{provider.defaultModel}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-border px-2 py-1">{provider.isActive ? "active" : "inactive"}</span>
                      <span className="rounded-full border border-border px-2 py-1">{provider.costTier}</span>
                      <span className="rounded-full border border-border px-2 py-1">{provider.hasCredentials ? "env" : "no env"}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {provider.supportsChat ? <span>chat</span> : null}
                    {provider.supportsTools ? <span>tools</span> : null}
                    {provider.supportsVision ? <span>vision</span> : null}
                    {provider.supportsJsonMode ? <span>json</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <SettingsCard icon={<SlidersHorizontal className="h-5 w-5 text-primary" />} title="System Behavior" settings={groups.SYSTEM} onUpdate={update} />
        <Card>
          <ServerCog className="h-5 w-5 text-primary" />
          <h2 className="mt-4 font-display text-xl">Backend</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-border pb-3">
              <dt className="text-muted-foreground">API URL</dt>
              <dd>{import.meta.env.VITE_API_URL ?? "http://localhost:4000/api"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Database</dt>
              <dd>PostgreSQL via Prisma</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-3">
              <dt className="text-muted-foreground">Frontend Mode</dt>
              <dd>{import.meta.env.MODE}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="mt-4 font-display text-xl">Security</h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            API keys are never returned by the settings or providers APIs. Configure secrets only in the server `.env`.
          </p>
        </Card>
      </div>
    </>
  );
}

function SettingsCard({ icon, title, settings, onUpdate }: { icon: ReactNode; title: string; settings: SettingDto[]; onUpdate: (key: string, value: string) => Promise<void> }) {
  return (
    <Card>
      {icon}
      <h2 className="mt-4 font-display text-xl">{title}</h2>
      <div className="mt-4 space-y-4">
        {settings.map((setting) => (
          <SettingRow key={setting.key} setting={setting} onUpdate={onUpdate} />
        ))}
      </div>
    </Card>
  );
}

function SettingRow({ setting, onUpdate }: { setting: SettingDto; onUpdate: (key: string, value: string) => Promise<void> }) {
  const isToggle = behaviorKeys.includes(setting.key);
  const inputId = `setting-${setting.key}`;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {isToggle ? (
            <div className="text-sm font-semibold">{setting.key}</div>
          ) : (
            <label htmlFor={inputId} className="block text-sm font-semibold">{setting.key}</label>
          )}
          {setting.description ? <div className="mt-1 text-xs text-muted-foreground">{setting.description}</div> : null}
        </div>
        {isToggle ? (
          <Button variant={setting.value === "true" ? "primary" : "outline"} onClick={() => void onUpdate(setting.key, setting.value === "true" ? "false" : "true")}>
            {setting.value === "true" ? "Enabled" : "Disabled"}
          </Button>
        ) : setting.key === "AI_PROVIDER" ? (
          <select id={inputId} className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={setting.value} onChange={(e) => void onUpdate(setting.key, e.target.value)}>
            <option value="mock">mock</option>
            <option value="openai-compatible">openai-compatible</option>
            <option value="openai">openai</option>
            <option value="openrouter">openrouter</option>
            <option value="deepseek">deepseek</option>
          </select>
        ) : setting.key === "AI_COST_MODE" ? (
          <select id={inputId} className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={setting.value} onChange={(e) => void onUpdate(setting.key, e.target.value)}>
            <option value="low">low</option>
            <option value="balanced">balanced</option>
            <option value="quality">quality</option>
          </select>
        ) : setting.key === "DEFAULT_TASK_MODE" ? (
          <select id={inputId} className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={setting.value} onChange={(e) => void onUpdate(setting.key, e.target.value)}>
            {["ASK", "PLAN", "RESEARCH", "BUILD"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        ) : (
          <Input id={inputId} className="sm:w-56" value={setting.value} onChange={(e) => void onUpdate(setting.key, e.target.value)} />
        )}
      </div>
    </div>
  );
}
