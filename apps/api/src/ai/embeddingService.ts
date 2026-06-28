/**
 * Embedding Service (M25-B)
 *
 * Generates semantic text embeddings for memory ranking. Two paths:
 *   - Real provider: calls the OpenAI-compatible /embeddings endpoint when
 *     OPENAI_API_KEY is present. Set OPENAI_EMBEDDING_MODEL to override the default model.
 *   - Mock (default): deterministic bag-of-words + bigram vector that produces
 *     real cosine overlap for shared vocabulary — no API key required, and tests
 *     can assert semantic ordering deterministically.
 *
 * Always returns a unit-length vector. Falls back to mock on any network error.
 */

const EMBEDDING_DIM = 128;
// Respect a per-call timeout for the real provider so memory writes never block long
const EMBEDDING_TIMEOUT_MS = 10_000;

// DJB2 hash — deterministic, fast, decent distribution across 128 buckets
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return h >>> 0; // 32-bit unsigned
}

/**
 * Deterministic bag-of-words + bigram embedding.
 * Words with shared vocabulary map to the same or adjacent hash buckets,
 * yielding a cosine similarity that reflects lexical overlap.
 */
export function mockEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9฀-๿\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  for (const word of words) {
    vec[djb2(word) % EMBEDDING_DIM]! += 1;
  }
  for (let i = 0; i < words.length - 1; i++) {
    vec[djb2(`${words[i]!}_${words[i + 1]!}`) % EMBEDDING_DIM]! += 0.5;
  }

  // Normalize to unit vector
  let mag = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) mag += vec[i]! * vec[i]!;
  mag = Math.sqrt(mag);
  if (mag > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) vec[i]! /= mag;
  }
  return vec;
}

/**
 * Returns a unit embedding vector for the given text.
 * Uses the real OpenAI-compatible /embeddings API when OPENAI_API_KEY is set,
 * otherwise falls back to mockEmbedding.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) return mockEmbedding(text);

  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input: text, model }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`Embedding API returned ${res.status}`);
    const body = (await res.json()) as { data: Array<{ embedding: number[] }> };
    const embedding = body.data[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) throw new Error("Empty embedding response");
    return embedding;
  } catch {
    return mockEmbedding(text);
  }
}

/**
 * Cosine similarity between two equal-length unit vectors.
 * Returns 0 when vectors have different lengths or zero magnitude.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
