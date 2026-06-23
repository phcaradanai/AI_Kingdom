# Codex Active Work Detail

`WORK_IN_PROGRESS.md` is the canonical team coordination board. This file records the detailed Codex scope and collision boundaries.

## Active

### Premium UX Wave 4D: Living Agents Roster

- **Owner / branch:** Codex on `codex/main`
- **Status:** IN PROGRESS from synchronized base `5cb0cc5`
- **Objective:** turn `/living-agents` into a compact operational roster with real-state scanning, role/state filters, focused evidence, and canonical source navigation.
- **Source ownership:** `Agent` owns identity and portrait profile; `AgentActivity` owns recorded activity/status; `WorkOrder` owns executable assignment; usage traces and provider records own cost/model evidence. This page remains read-only.
- **Expected edits:** `LivingAgentsPage.tsx`, focused modules under `pages/living-agents/`, focused tests, a scoped message module, minimal i18n registration, and completion docs.
- **Collision boundary:** no API, Prisma, lifecycle, provider-routing, portrait, RBAC, execution, patch, push, PR, merge, or deploy contract changes.
- **Validation target:** focused/full web tests, root typecheck/build, web lint, and EN/TH browser checks at 1440x900, 1024x768, and 430x932.

## Completed Wave 4C Contract

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

1. Captured English/Thai baselines at 1440x900, 1024x768, and 430x932; the prior mobile layout widened to 564px at a 430px viewport.
2. Added six focused tests covering error state, agent/session selection, creation, follow-up sending, save-mode payload, source links, pane transitions, and Thai chrome.
3. Split the 400-line route into a 7-line route plus controller, models, browser rail, conversation, context/source, workspace, and message modules; every module is below 205 lines.
4. Implemented aligned desktop panes and a one-pane tablet/mobile flow with preserved draft state, 44px controls, reduced-motion-safe feedback, and no horizontal overflow.
5. Verified 205/205 web tests, root typecheck, web lint, root build, and live EN/TH browser checks at all required viewports.

### Collision Boundaries

- M24 Phase B and opt-in council parallelization are already merged. Preserve the Phase B `api.ts` and `i18nMessages.ts` additions; council parallelization is backend-only and does not overlap this web scope.
- Do not edit API routes, services, Prisma, or duplicated DTO files unless a verified frontend blocker requires team coordination.
- Do not change direct-chat lifecycle, provider routing, save semantics, memory approval, or project ownership.
- No auto-execution, filesystem access, patching, push, PR, merge, or deploy path belongs in Wave 4C.

## Recently Completed

| Status | Owner | Branch | Completed | Scope |
| --- | --- | --- | --- | --- |
| COMPLETE | Codex | `codex/main` | 2026-06-23 | Premium UX Wave 4C: Agent Chat Workspace |
| COMPLETE | Codex | `codex/main` | 2026-06-23 | Premium UX Wave 4B: External Agents Registry |
