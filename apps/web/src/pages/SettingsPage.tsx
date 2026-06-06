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
        <SettingsCard icon={<KeyRound className="h-5 w-5 text-primary" />} title="AI Settings" settings={groups.AI} onUpdate={update} />
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
            `OPENAI_API_KEY` is never returned by the settings API. Configure secrets only in the server `.env`.
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

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">{setting.key}</div>
          {setting.description ? <div className="mt-1 text-xs text-muted-foreground">{setting.description}</div> : null}
        </div>
        {isToggle ? (
          <Button variant={setting.value === "true" ? "primary" : "outline"} onClick={() => void onUpdate(setting.key, setting.value === "true" ? "false" : "true")}>
            {setting.value === "true" ? "Enabled" : "Disabled"}
          </Button>
        ) : setting.key === "AI_PROVIDER" ? (
          <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={setting.value} onChange={(e) => void onUpdate(setting.key, e.target.value)}>
            <option value="mock">mock</option>
            <option value="openai">openai</option>
          </select>
        ) : setting.key === "DEFAULT_TASK_MODE" ? (
          <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={setting.value} onChange={(e) => void onUpdate(setting.key, e.target.value)}>
            {["ASK", "PLAN", "RESEARCH", "BUILD"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        ) : (
          <Input className="sm:w-56" value={setting.value} onChange={(e) => void onUpdate(setting.key, e.target.value)} />
        )}
      </div>
    </div>
  );
}
