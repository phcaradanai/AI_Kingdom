import { Edit2, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { KingdomVisionDto } from "@/types/api";

function parseMarkdownSections(content: string): Array<{ heading: string; body: string }> {
  const lines = content.split("\n");
  const sections: Array<{ heading: string; body: string }> = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
      current = { heading: line.replace(/^##\s+/, ""), lines: [] };
    } else if (line.startsWith("# ")) {
      // skip top-level title
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
  return sections;
}

const SECTION_ACCENTS: Record<string, string> = {
  "current goal": "border-l-4 border-primary pl-4",
  "near-term priorities": "border-l-4 border-amber-500/60 pl-4",
  "success metrics": "border-l-4 border-green-500/60 pl-4"
};

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

export function VisionPage() {
  const user = useAuthStore((state) => state.user);
  const isKing = user?.role === "KING";
  const [vision, setVision] = useState<KingdomVisionDto | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.vision()
      .then((r) => setVision(r.vision))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save() {
    if (!vision) return;
    setSaving(true);
    try {
      const updated = await api.updateVision({ content: draft });
      setVision(updated.vision);
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
        <PageHeader eyebrow="Kingdom" title="Kingdom Vision" description="Strategic direction and royal priorities." />
        <Card className="p-6 text-sm text-red-400">{error}</Card>
      </>
    );
  }

  if (!vision) {
    return (
      <>
        <PageHeader eyebrow="Kingdom" title="Kingdom Vision" description="Strategic direction and royal priorities." />
        <Card className="p-6 text-sm text-muted-foreground">Loading Vision…</Card>
      </>
    );
  }

  const sections = parseMarkdownSections(vision.content);

  return (
    <>
      <PageHeader
        eyebrow="Kingdom"
        title="Kingdom Vision"
        description="Strategic direction, priorities, and success metrics for the realm."
      />

      {editing ? (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Editing Vision (Markdown)</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save Vision"}
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
          {sections.map((section) => {
            const accent = SECTION_ACCENTS[section.heading.toLowerCase()] ?? "";
            return (
              <Card key={section.heading} className="p-5">
                <h2 className={`mb-3 font-display text-lg text-primary ${accent ? "" : ""}`}>{section.heading}</h2>
                <div className={`space-y-2 text-sm text-foreground/90 ${accent}`}>
                  {renderBody(section.body)}
                </div>
              </Card>
            );
          })}
          {isKing && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setDraft(vision.content);
                  setEditing(true);
                }}
              >
                <Edit2 className="h-4 w-4" />
                Edit Vision
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 text-xs text-muted-foreground">
        Version {vision.version} · Last updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(vision.updatedAt))}
      </div>
    </>
  );
}
