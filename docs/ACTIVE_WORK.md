# Active Work Coordination

This file records work currently in progress so contributors can avoid overlapping edits. Update the entry when scope, branch, or status changes; remove completed entries after the work is merged and recorded in `PROJECT_STATUS.md`.

| Status | Owner | Branch | Base | Started | Scope |
| --- | --- | --- | --- | --- | --- |
| IN PROGRESS | Codex | `codex/main` | `main` at `655e658` | 2026-06-23 | Premium UX Wave 4B: External Agents Registry |

## Codex: Premium UX Wave 4B

### Objective

Refine `/external-agents` into a compact registry and selected-detail workspace that makes live readiness, capabilities, execution mode, validation evidence, manual-handoff ownership, and source records easy to compare.

### Expected edit surface

- `apps/web/src/pages/ExternalAgentsPage.tsx`
- New focused modules under `apps/web/src/pages/external-agents/`
- `apps/web/src/pages/ExternalAgentsPage*.test.tsx`
- `apps/web/src/lib/i18nMessages.ts` and a scoped external-agent message module
- `NEXT_TASK.md`, `PROJECT_STATUS.md`, and `docs/UX_UI_REFINEMENT_PLAN.md`

### Coordination notes

- Avoid parallel refactors of `/external-agents` or its focused tests until this entry is marked complete.
- Backend readiness, runner capability, Work Order lifecycle, and RBAC contracts are source-owned and are not being redesigned.
- Manual handoff and explicit King selection remain mandatory. This work adds no auto-patch, auto-push, PR, merge, deploy, filesystem, or proprietary external-agent execution path.
- Readiness labels must come from the existing readiness API and runner evidence; do not invent availability or validation results.

### Planned delivery

1. Audit current API/data ownership and capture EN/TH responsive baselines.
2. Add focused hierarchy, safety, source-link, dialog, and translation tests.
3. Split page orchestration, controller/models, registry/detail, and dialogs below 600 lines where practical.
4. Run focused/full tests, root typecheck/build, and browser QA.
5. Mark this entry complete, update project status, commit on `codex/main`, and fast-forward into `main`.
