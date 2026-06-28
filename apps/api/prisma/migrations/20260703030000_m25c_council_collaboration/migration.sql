-- M25-C: Agent Collaboration Protocol
-- Adds collaborationNotes JSONB to CouncilSession to record structured
-- Researcher→Archivist sub-query exchanges when COUNCIL_COLLABORATION_ENABLED=true.
ALTER TABLE "CouncilSession" ADD COLUMN "collaborationNotes" JSONB;
