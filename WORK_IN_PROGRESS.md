# Work In Progress - Team Coordination

This is the canonical board for who is working on what and on which branch. Update your own entry before implementation, when scope changes, and after the work is merged. Detailed Codex scope lives in `docs/ACTIVE_WORK.md`; completed history lives in `PROJECT_STATUS.md`.

Division of labor: **Codex owns UX/UI**, **Claude owns the core system** (`claude/main`). Integrate through `main`.

## Active Now

### Codex - `codex/main`

- **Premium UX Wave 4C: Agent Chat Workspace** - PLANNING / RESERVED
- Base: `main` at `dfa9201` after merging M24 Phase B.
- Route: `/agent-chat`.
- Objective: convert the current three competing card columns into a stable sessions/agents rail, focused conversation, and context/source rail with a one-pane mobile flow.
- Expected edit surface: `apps/web/src/pages/AgentChatPage.tsx`, new modules under `apps/web/src/pages/agent-chat/`, focused page tests, and scoped semantic EN/TH messages.
- Contract boundary: preserve direct-agent session/message APIs, project binding, save modes, provider routing, Artifact/Knowledge Candidate ownership, RBAC, and secret handling. No Work Order execution, external-agent dispatch, patching, push, PR, merge, or deploy behavior is being added.
- Implementation has not started. Baseline capture, source mapping, and focused tests come first.

### Claude - `claude/main`

- No new core item is recorded as active on this board.
- M24 Phase B supervised auto-retry is merged into `main` at `dfa9201`; implementation details and validation are recorded in `PROJECT_STATUS.md`.

## Collision Watch

- M24 Phase B touched `apps/web/src/lib/api.ts`, `apps/web/src/lib/i18nMessages.ts`, and `AutomationJobsPage.tsx`; Codex has merged those changes before Wave 4C planning.
- Wave 4C should avoid backend/API/type changes unless a verified contract gap blocks the UX. Any contract change must be coordinated before implementation.
- `apps/web/src/lib/i18nMessages.ts` remains a shared integration point. Wave 4C should add a scoped message module and keep the central edit minimal.

Last updated: 2026-06-23 by Codex.
