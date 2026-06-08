-- AlterTable: Store normalized royal identity, authority, and memory policy profile data.
ALTER TABLE "Agent" ADD COLUMN "config" JSONB;
