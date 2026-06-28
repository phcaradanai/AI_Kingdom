-- M25-B: Semantic Memory Search
-- Adds an optional JSONB column to store a pre-computed embedding vector per Memory row.
-- The vector is a fixed-length float array (128-dim mock or real provider dimension).
-- NULL means the row has not yet been embedded and the keyword-fallback path applies.

ALTER TABLE "Memory" ADD COLUMN "embeddingVector" JSONB;
