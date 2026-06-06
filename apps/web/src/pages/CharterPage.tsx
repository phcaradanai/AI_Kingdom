import { Edit2, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { KingdomCharterDto } from "@/types/api";

function parseMarkdownSections(content: string): Array<{ heading: string; body: string }> {
  const lines = content.split("\n");
  const sections: Array<{ heading: string; body: string }> = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
      current = { heading: line.replace(/^##\s+/, ""), lines: [] };
    } else if (line.startsWith("# ")) {
      // top-level heading — skip it, it's the page title
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
  return sections;
}

function renderBody(body: string) {
  const lines = body.split("\n");
  return lines.map((line, i) => {
    if (/^\d+\./.test(line.trim())) {
      return <li key={i} className="ml-4 list-decimal">{line.trim().replace(/^\d+\.\s*/, "")}</li>;
    }
    if (line.trim().startsWith("- ")) {
      return <li key={i} className="ml-4 list-disc">{line.trim().slice(2)}</li>;
    }
    if (line.trim() === "") return null;
    return <p key={i} className="leading-relaxed">{line.trim()}</p>;
  }).filter(Boolean);
}

export function CharterPage() {
  const user = useAuthStore((state) => state.user);
  const isKing = user?.role === "KING";
  const [charter, setCharter] = useState<KingdomCharterDto | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.charter()
      .then((r) => setCharter(r.charter))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save() {
    if (!charter) return;
    setSaving(true);
    try {
      const updated = await api.updateCharter({ content: draft });
      setCharter(updated.charter);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Kingdom" title="Kingdom Charter" description="The constitutional foundation of the AI Kingdom." />
        <Card className="p-6 text-sm text-red-400">{error}</Card>
      </>
    );
  }

  if (!charter) {
    return (
      <>
        <PageHeader eyebrow="Kingdom" title="Kingdom Charter" description="The constitutional foundation of the AI Kingdom." />
        <Card className="p-6 text-sm text-muted-foreground">Loading Charter…</Card>
      </>
    );
  }

  const sections = parseMarkdownSections(charter.content);

  return (
    <>
      <PageHeader
        eyebrow="Kingdom"
        title="Kingdom Charter"
        description="The constitutional foundation governing all agents and royal decisions."
      />

      {/* Mission statement */}
      <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 px-6 py-5">
        <div className="text-xs font-semibold uppercase tracking-widest text-primary/70 mb-2">Prime Directive</div>
        <p className="text-lg font-medium leading-relaxed text-foreground">{charter.mission}</p>
      </div>

      {editing ? (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Editing Charter (Markdown)</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save Charter"}
              </Button>
            </div>
          </div>
          <textarea
            className="h-96 w-full rounded-md border border-input bg-background p-3 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <Card key={section.heading} className="p-5">
              <h2 className="mb-3 font-display text-lg text-primary">{section.heading}</h2>
              <div className="space-y-2 text-sm text-foreground/90">
                {renderBody(section.body)}
              </div>
            </Card>
          ))}
          {isKing && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setDraft(charter.content);
                  setEditing(true);
                }}
              >
                <Edit2 className="h-4 w-4" />
                Edit Charter
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 text-xs text-muted-foreground">
        Version {charter.version} · Last updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(charter.updatedAt))}
      </div>
    </>
  );
}
