-- M18D: Persist council next executable action and work-order creation trail.

CREATE TYPE "KingdomNextExecutableAction" AS ENUM (
  'NONE',
  'CREATE_WORK_ORDER',
  'CREATE_EXTERNAL_HANDOFF',
  'RUN_VALIDATION',
  'SCAN_LOCAL_DOCS',
  'BIND_CONTEXT',
  'REVIEW_PATCH'
);

ALTER TABLE "CouncilSession"
  ADD COLUMN "nextExecutableAction" "KingdomNextExecutableAction",
  ADD COLUMN "nextExecutableActionReason" TEXT,
  ADD COLUMN "nextExecutableActionComputedAt" TIMESTAMP(3),
  ADD COLUMN "createdWorkOrderId" TEXT,
  ADD COLUMN "createdWorkOrderAt" TIMESTAMP(3),
  ADD COLUMN "createdWorkOrderBy" TEXT;

CREATE INDEX "CouncilSession_nextExecutableAction_idx" ON "CouncilSession"("nextExecutableAction");
CREATE INDEX "CouncilSession_createdWorkOrderId_idx" ON "CouncilSession"("createdWorkOrderId");
