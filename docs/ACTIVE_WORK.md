# Codex Active Work Detail

`WORK_IN_PROGRESS.md` is the canonical team coordination board. This file records the detailed Codex scope and collision boundaries.

## Active

| Status | Owner | Branch | Base | Started | Scope |
| --- | --- | --- | --- | --- | --- |
| PLANNING / RESERVED | Codex | `codex/main` | `main` at `dfa9201` | 2026-06-23 | Premium UX Wave 4C: Agent Chat Workspace |

## Wave 4C Plan

### Objective

Refine `/agent-chat` into a focused direct-agent conversation workspace. Desktop uses sessions/agents, conversation, and context/source panes; mobile shows one pane at a time with explicit navigation and preserved draft state.

### Source Ownership

- `DirectAgentSession` and messages remain owned by `/api/agent-conversations` and `directAgentConversationService.ts`.
- Canonical internal-agent identity remains owned by `Agent`; Agent Chat only renders its DTO projection.
- Project context remains owned by `Project` and the selected `projectId` on a new session.
- Usage Trace, Artifact, and Knowledge Candidate remain canonical linked records. Agent Chat must not copy or mutate their source data outside the existing save-mode contract.
- Provider routing, memory review, RBAC, and secrets remain server-owned.

### Expected Edit Surface

- `apps/web/src/pages/AgentChatPage.tsx`
- New focused modules under `apps/web/src/pages/agent-chat/`
- `apps/web/src/pages/AgentChatPage.test.tsx`
- A scoped Agent Chat message module plus a minimal `apps/web/src/lib/i18nMessages.ts` registration
- `NEXT_TASK.md`, `PROJECT_STATUS.md`, `WORK_IN_PROGRESS.md`, and `docs/UX_UI_REFINEMENT_PLAN.md` at completion

### Delivery Plan

1. Capture English/Thai baselines at 1440x900, 1024x768, and 430x932; record hierarchy, overflow, touch-target, and console findings.
2. Add focused tests for loading/error states, agent/session selection, new-session creation, message sending, save-mode ownership, source links, mobile pane transitions, and Thai chrome.
3. Split route orchestration, pure models, controller, session/agent rail, conversation, composer, context/source rail, and any focused dialog below 600 lines each.
4. Implement a symmetric desktop workspace and one-pane mobile flow. Preserve long-message readability, draft state, reduced-motion behavior, and 44px controls.
5. Run focused/full web tests, root typecheck/build, and responsive browser QA; then update status, commit on `codex/main`, and fast-forward into `main`.

### Collision Boundaries

- M24 Phase B is already merged. Preserve its `api.ts` and `i18nMessages.ts` additions.
- Do not edit API routes, services, Prisma, or duplicated DTO files unless a verified frontend blocker requires team coordination.
- Do not change direct-chat lifecycle, provider routing, save semantics, memory approval, or project ownership.
- No auto-execution, filesystem access, patching, push, PR, merge, or deploy path belongs in Wave 4C.

## Recently Completed

| Status | Owner | Branch | Completed | Scope |
| --- | --- | --- | --- | --- |
| COMPLETE | Codex | `codex/main` | 2026-06-23 | Premium UX Wave 4B: External Agents Registry |
