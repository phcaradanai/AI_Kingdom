# Codex Active Work Detail

`WORK_IN_PROGRESS.md` is the canonical team coordination board. This file records the detailed Codex scope and collision boundaries.

## Active

No active Codex implementation. Before the next slice, merge latest `main` into `codex/main` and update this file with the reserved branch/scope.

## Completed Wave 4F Contract

### Objective

Replace the repeated `/providers` card grid with a compact registry and focused detail/configuration workspace that exposes readiness, credential-reference state, health, default model, pricing coverage, and canonical owner links without exposing secrets.

### Source Ownership

- Provider registry/config remains owned by `/api/providers` and `aiProviderRegistry`.
- Route chains and fallback policy remain owned by `/routing`.
- Pricing, balances, spend, health, and telemetry remain owned by `/treasury` and provider telemetry APIs.
- Secrets remain server-side environment values. The browser only renders public readiness booleans and environment variable references for custom providers.

### Delivery

1. Reduced `ProvidersPage.tsx` to a thin route and split the workspace into controller, pure provider models, registry, detail, edit dialog, delete dialog, badges, scoped messages, and focused tests; every Providers file is below 600 lines.
2. Replaced the repeated card grid with a compact searchable/filterable registry and selected detail pane. Mobile uses an explicit registry-to-detail handoff; desktop/tablet keep the registry and detail aligned.
3. Added semantic English/Thai chrome, 44px controls, readiness/health badges, partial-telemetry failure handling, and source links to Routing and Treasury in the overview.
4. Preserved secret safety: provider creation accepts environment variable names only and never renders literal API key values.
5. Verified 7/7 focused tests, 226/226 full web tests, web typecheck, root typecheck, web build, root build, and `git diff --check`. Live browser checks covered `/providers` at 1440x900, 1024x768, and 430x932 in Thai: 9 providers loaded, no horizontal overflow, semantic Thai chrome rendered, source links were visible in detail, and tablet source cards were recomposed to avoid narrow two-column cards.

### Collision Boundaries

- No API, DTO, Prisma, provider routing, health telemetry, treasury, credential resolution, RBAC, audit, lifecycle, patch, push, PR, merge, or deploy contract changed.

## Completed Wave 4E Contract

### Objective

Replace the 876-line, 12-tab Living Agent profile with five focused evidence sections: Overview, Timeline, Work & Relationships, Usage & Traces, and Knowledge & Audit.

### Source Ownership

- `Agent` remains the canonical identity and presentation-profile owner.
- Agent activity/timeline APIs remain the owner of activity, trace attribution, prompt/response previews, tokens, and cost evidence.
- Project, Task, Council, Report, Memory, Knowledge Candidate, Provider, Usage Trace, and Audit remain canonical linked records; this profile does not copy or mutate them.

### Delivery

1. Reduced the route to 6 lines and split controller, models, header, navigation, five evidence sections, scoped messages, and focused tests; every file is below 600 lines.
2. Added semantic English/Thai chrome, 44px controls, responsive five-section navigation, explicit owner links, legacy-attribution disclosure, and reduced-motion-safe active-state feedback.
3. Kept profile loading immediate while timeline, relations, candidates, and memories load only when their owning section opens; agent-scoped request guards prevent duplicate or stale relation/knowledge updates.
4. Verified 8/8 focused tests, 219/219 full web tests, web lint, root typecheck, root build, and `git diff --check`.
5. Responsive browser verification remains outstanding because the in-app browser tab was on a non-navigable browser error document during this run; no visual-pass claim is recorded.

### Collision Boundaries

- No API, DTO, Prisma, council intelligence, lifecycle, provider routing, RBAC, execution, patch, push, PR, or deploy contract changed.

## Completed Wave 4D Contract

### Objective

Refine `/living-agents` into a compact operational roster with real-state scanning, role/state filters, focused evidence, and canonical source navigation.

### Source Ownership

- `Agent` remains the canonical identity and portrait-profile owner; roster rows do not edit it.
- `AgentActivity` remains the owner of recorded status and attribution counts.
- Existing Kingdom Presence supplies optional live task, Work Order, progress, and blocking evidence for authorized roles. A denied/unavailable presence response degrades to summary evidence without blocking the roster.
- `WorkOrder`, Providers, usage, timeline, trace, and relationship records remain in their owning routes. This page links to them and does not copy or mutate them.

### Delivery

1. Replaced repeated three-column cards with a compact roster and selected evidence pane; the 246-line route is now 6 lines.
2. Split controller, models, toolbar, roster, evidence, workspace, messages, and focused tests; every file is below 180 lines.
3. Added state and role filters, explicit roster/detail handoff below `xl`, 44px controls, source links, real presence/assignment evidence, and reduced-motion-safe state feedback.
4. Added semantic English/Thai chrome while preserving server-owned identity, description, activity, provider, model, and error data.
5. Verified 6/6 focused tests, 211/211 full web tests, root typecheck, web lint, root build, and live EN/TH browser checks at 1440x900, 1024x768, and 430x932.

### Collision Boundaries

- No API, DTO, Prisma, lifecycle, provider-routing, portrait, RBAC, execution, patch, push, PR, merge, or deploy contract changed.
- Presence enrichment uses the existing endpoint and treats its stricter RBAC as an optional evidence boundary.

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
| COMPLETE | Codex | `codex/main` | 2026-06-23 | Premium UX Wave 4D: Living Agents Roster |
| COMPLETE | Codex | `codex/main` | 2026-06-23 | Premium UX Wave 4C: Agent Chat Workspace |
| COMPLETE | Codex | `codex/main` | 2026-06-23 | Premium UX Wave 4B: External Agents Registry |
