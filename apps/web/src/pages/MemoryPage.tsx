import { FormEvent, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate } from "@/lib/utils";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { MemoryDto, MemoryImportance, MemoryPayload, MemoryType } from "@/types/api";

const memoryTypes: MemoryType[] = ["DECISION", "FACT", "PREFERENCE", "CONSTRAINT", "PROJECT_NOTE", "LESSON"];
const importanceLevels: MemoryImportance[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const emptyForm: MemoryPayload = {
  type: "PROJECT_NOTE",
  title: "",
  content: "",
  tags: [],
  importance: "MEDIUM"
};

export function MemoryPage() {
  const memories = useKingdomStore((state) => state.memories);
  const searchMemories = useKingdomStore((state) => state.searchMemories);
  const createMemory = useKingdomStore((state) => state.createMemory);
  const updateMemory = useKingdomStore((state) => state.updateMemory);
  const deleteMemory = useKingdomStore((state) => state.deleteMemory);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemoryType | "ALL">("ALL");
  const [editing, setEditing] = useState<MemoryDto | null>(null);
  const [form, setForm] = useState<MemoryPayload>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const filteredMemories = useMemo(
    () => memories.filter((memory) => typeFilter === "ALL" || memory.type === typeFilter),
    [memories, typeFilter]
  );

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    await searchMemories(query);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.title.trim() || !form.content.trim()) {
      setError("Title and content are required.");
      return;
    }

    if (editing) {
      await updateMemory(editing.id, form);
    } else {
      await createMemory(form);
    }
    setEditing(null);
    setForm(emptyForm);
  }

  function startEdit(memory: MemoryDto) {
    setEditing(memory);
    setForm({
      type: memory.type,
      title: memory.title,
      content: memory.content,
      tags: memory.tags,
      importance: memory.importance,
      sourceTaskId: memory.sourceTaskId,
      sourceCouncilSessionId: memory.sourceCouncilSessionId
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Kingdom Memory"
        title="Institutional memory"
        description="Manage decisions, facts, preferences, constraints, project notes, and lessons used by the council."
      />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card>
          <h2 className="font-display text-xl">{editing ? "Edit memory" : "Create memory"}</h2>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Memory title" />
            <Textarea
              className="min-h-32"
              value={form.content}
              onChange={(event) => setForm({ ...form, content: event.target.value })}
              placeholder="Concise memory content"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="h-11 rounded-md border border-border bg-input px-3 text-sm"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as MemoryType })}
              >
                {memoryTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <select
                className="h-11 rounded-md border border-border bg-input px-3 text-sm"
                value={form.importance}
                onChange={(event) => setForm({ ...form, importance: event.target.value as MemoryImportance })}
              >
                {importanceLevels.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
            <Input
              value={form.tags.join(", ")}
              onChange={(event) => setForm({ ...form, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
              placeholder="tags, comma, separated"
            />
            {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
            <div className="flex gap-2">
              <Button>{editing ? "Save Memory" : "Create Memory"}</Button>
              {editing ? (
                <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(emptyForm); }}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </Card>

        <div>
          <Card>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSearch}>
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search kingdom memory..." />
              <select
                className="h-11 rounded-md border border-border bg-input px-3 text-sm"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as MemoryType | "ALL")}
              >
                <option value="ALL">ALL TYPES</option>
                {memoryTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <Button>Search</Button>
            </form>
          </Card>

          <div className="mt-4 space-y-4">
            {filteredMemories.map((memory) => (
              <Card key={memory.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl">{memory.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(memory.updatedAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge label={memory.type} />
                    <Badge label={memory.importance} highlight={memory.importance === "HIGH" || memory.importance === "CRITICAL"} />
                  </div>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{memory.content}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {memory.tags.map((tag) => <Badge key={tag} label={tag} />)}
                </div>
                {(memory.sourceTaskId || memory.sourceCouncilSessionId) ? (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Source: {memory.sourceTaskId ? `task ${memory.sourceTaskId.slice(0, 8)}` : ""}
                    {memory.sourceCouncilSessionId ? ` session ${memory.sourceCouncilSessionId.slice(0, 8)}` : ""}
                  </p>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => startEdit(memory)}>Edit</Button>
                  <Button variant="outline" onClick={() => void deleteMemory(memory.id)}>Delete</Button>
                </div>
              </Card>
            ))}
            {filteredMemories.length === 0 ? (
              <Card>
                <p className="text-sm text-muted-foreground">No memories found.</p>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function Badge({ label, highlight = false }: { label: string; highlight?: boolean }) {
  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-xs", highlight ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground")}>
      {label}
    </span>
  );
}
