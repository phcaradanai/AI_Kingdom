# Next Task

## M17E-2: Repository Snapshot + WorkOrder Context Binding (current)

Goal: make repository/local document snapshot binding mandatory for planning, validation, sandbox patching, reporting, and patch review, so agents never act on stale or unknown project state.

## Scope

1. **Data model**: snapshot binding fields on `WorkOrder` (`contextBindingStatus`/summary/provenance), `AutomationJob` (`contextValidationStatus`/summary), `PatchArtifact` (`baseContextStatus`/provenance), `ImplementationReport` (`contextUsed`), plus `RoyalBrief.contextHealthSummary`.
2. **Binding service**: `projectContextBindingService.ts` — bind/validate/explain/mark-stale; FRESH/STALE/MISSING/PARTIAL semantics.
3. **Enforcement**: SANDBOX_PATCH requires project linkage + FRESH context (API reject, Living Loop `ContextBinding:*` skips, runner refusal); VALIDATION_ONLY proceeds with warnings.
4. **API**: `GET /api/work-orders/:id/context`, `POST /api/work-orders/:id/bind-context`, `POST /api/work-orders/:id/mark-context-stale`, `GET /api/projects/:id/context-health`.
5. **UI**: WorkOrder Project Context panel + Bind/Refresh; Automation Jobs context badges; Patch Review "Base Context Used"; Living Loop context skips; Royal Brief Context Health; Project detail bound-snapshot indicator.
6. **Docs + tests**: AGENTS/CLAUDE/ARCHITECTURE/README/PROJECT_STATUS updates; backend/runner/frontend tests; root `npm run test`, `npm run typecheck`, `npm run build`.

## Constraints

- No auto-merge, auto-deploy, or auto-PR creation; auto sandbox patch safety unchanged.
- No arbitrary local path reads (LocalDocumentRoot + safe resolver only); no raw secrets or raw root paths stored.
- No SANDBOX_PATCH when required context is stale/missing; no job creation from GET/page load.
- New Prisma migrations must be deployed to dev **and** `ai_kingdom_test` before running root tests.

## Manual acceptance checklist

1. Open project detail and confirm latest Local Docs snapshot is READY.
2. Create a WorkOrder linked to that project.
3. Confirm the WorkOrder has a Project Context panel with FRESH status.
4. Mark local docs stale (or use Mark Context Stale).
5. Confirm the WorkOrder context warning appears.
6. Try creating a SANDBOX_PATCH job; it must be refused while stale.
7. Click Bind/Refresh Context (after a fresh scan).
8. Confirm status returns to FRESH.
9. Create a VALIDATION_ONLY job and confirm context provenance appears on the job.
10. Create a LOW-risk SANDBOX_PATCH and confirm the PatchArtifact shows "Base Context Used".
11. Generate a Royal Brief and confirm context health decisions appear.
