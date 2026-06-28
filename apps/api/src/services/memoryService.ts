import type { AgentResponse, CouncilSession, Memory, MemoryImportance, MemoryType, Task } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { cosineSimilarity, generateEmbedding } from "../ai/embeddingService.js";
import { isForbiddenMemoryContent } from "./memorySafety.js";

export type MemoryCandidate = {
  type: MemoryType;
  title: string;
  content: string;
  tags: string[];
  importance: MemoryImportance;
};

const SENSITIVE_PATTERNS = [/api[_-]?key/i, /password/i, /secret/i, /token/i, /sk-[a-z0-9]/i];

export async function findRelevantMemories(userId: string, command: string, limit = 5): Promise<Memory[]> {
  const tokens = tokenize(command);
  if (tokens.length === 0) return [];

  const memories = await prisma.memory.findMany({ where: { createdBy: userId } });
  if (memories.length === 0) return [];

  // Generate a query embedding — uses the real provider when OPENAI_API_KEY is set,
  // falls back to the deterministic bag-of-words mock otherwise.
  const queryVec = await generateEmbedding(command);

  return memories
    .map((memory) => {
      const stored = memory.embeddingVector;
      // Prefer semantic similarity when an embedding is stored
      if (Array.isArray(stored) && stored.length > 0) {
        return { memory, score: cosineSimilarity(queryVec, stored as number[]) };
      }
      // Keyword fallback for unembedded rows (normalised to 0–1 range)
      return { memory, score: scoreMemory(memory, tokens) / 10 };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.memory);
}

export function formatMemoryContext(memories: Memory[]): string {
  return memories
    .map((memory, index) => `${index + 1}. [${memory.type}/${memory.importance}] ${memory.title}: ${memory.content}`)
    .join("\n");
}

export async function autoSaveMemories(input: {
  userId: string;
  task: Task;
  session: CouncilSession;
  responses: AgentResponse[];
}): Promise<Memory[]> {
  const candidates = extractMemoryCandidates(input.task, input.session, input.responses);
  const existing = await prisma.memory.findMany({
    where: { createdBy: input.userId },
    select: { title: true, content: true }
  });
  const saved: Memory[] = [];

  for (const candidate of candidates) {
    if (isSensitive(candidate.title) || isSensitive(candidate.content) || isForbiddenMemoryContent(candidate.title, candidate.content)) {
      continue;
    }
    if (isDuplicate(candidate, existing) || isDuplicate(candidate, saved)) {
      continue;
    }

    const embeddingVector = await generateEmbedding(`${candidate.title} ${trimContent(candidate.content, 700)}`);
    const memory = await prisma.memory.create({
      data: {
        ...candidate,
        content: trimContent(candidate.content, 700),
        embeddingVector,
        sourceTaskId: input.task.id,
        projectId: input.task.projectId,
        sourceCouncilSessionId: input.session.id,
        createdBy: input.userId
      }
    });
    saved.push(memory);
  }

  return saved;
}

export function extractMemoryCandidates(task: Task, session: CouncilSession, responses: AgentResponse[]): MemoryCandidate[] {
  const text = [session.finalSummary, ...responses.map((response) => response.response)].filter(Boolean).join("\n");
  const tags = unique([task.mode.toLowerCase(), ...tokenize(task.command).slice(0, 5)]);
  const candidates: MemoryCandidate[] = [];

  if (session.finalSummary && isMeaningful(session.finalSummary)) {
    candidates.push({
      type: "DECISION",
      title: `Decision from ${task.title}`,
      content: trimContent(session.finalSummary, 600),
      tags,
      importance: task.mode === "BUILD" || task.mode === "PLAN" ? "HIGH" : "MEDIUM"
    });
  }

  if (/(constraint|risk|avoid|must|cannot|should not)/i.test(text)) {
    candidates.push({
      type: "CONSTRAINT",
      title: `Constraint noted for ${task.title}`,
      content: extractSentence(text, /(constraint|risk|avoid|must|cannot|should not)/i),
      tags: unique(["constraint", ...tags]),
      importance: "HIGH"
    });
  }

  if (/(preference|prefer|style|tone|use |default)/i.test(text)) {
    candidates.push({
      type: "PREFERENCE",
      title: `Preference from ${task.title}`,
      content: extractSentence(text, /(preference|prefer|style|tone|use |default)/i),
      tags: unique(["preference", ...tags]),
      importance: "MEDIUM"
    });
  }

  if (/(lesson|learned|checkpoint|next step|recommend)/i.test(text)) {
    candidates.push({
      type: "LESSON",
      title: `Lesson from ${task.title}`,
      content: extractSentence(text, /(lesson|learned|checkpoint|next step|recommend)/i),
      tags: unique(["lesson", ...tags]),
      importance: "MEDIUM"
    });
  }

  candidates.push({
    type: "PROJECT_NOTE",
    title: `Royal decree: ${task.title}`,
    content: trimContent(task.command, 500),
    tags,
    importance: "LOW"
  });

  return candidates
    .filter((candidate) => isMeaningful(candidate.content))
    .filter((candidate) => !isForbiddenMemoryContent(candidate.title, candidate.content))
    .slice(0, 5);
}

export function isDuplicate(candidate: MemoryCandidate, existing: Array<Pick<Memory, "title" | "content">>): boolean {
  const title = normalize(candidate.title);
  const content = normalize(candidate.content);

  return existing.some((memory) => {
    const existingTitle = normalize(memory.title);
    const existingContent = normalize(memory.content);
    return existingTitle === title || existingContent === content || existingContent.includes(content) || content.includes(existingContent);
  });
}

export function isSensitive(value: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

function scoreMemory(memory: Memory, tokens: string[]): number {
  const haystack = normalize(`${memory.title} ${memory.content} ${memory.tags.join(" ")}`);
  const importanceBoost: Record<MemoryImportance, number> = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    CRITICAL: 3
  };
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0) + importanceBoost[memory.importance];
}

function tokenize(value: string): string[] {
  return unique(
    normalize(value)
      .split(/\W+/)
      .filter((token) => token.length > 2)
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function trimContent(value: string, maxLength: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 3)}...` : trimmed;
}

function isMeaningful(value: string): boolean {
  return value.trim().split(/\s+/).length >= 5;
}

function extractSentence(text: string, pattern: RegExp): string {
  const sentence = text
    .split(/(?<=[.!?])\s+/)
    .find((item) => pattern.test(item));
  return trimContent(sentence ?? text, 500);
}
