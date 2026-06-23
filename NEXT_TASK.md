# Next Task

## Premium UX Wave 4C: Agent Chat Workspace

Status: **planned - ready to implement**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`
Owner: Codex on `codex/main` (planning/reserved; implementation not started)

### Goal

Turn `/agent-chat` into a stable conversation workspace where the King can choose one internal agent, follow the active conversation, understand project and save-mode context, and review source-owned outputs without scanning three competing card columns.

### Scope

- Three-pane desktop layout: compact session/agent rail, focused conversation, and context/source rail.
- One-pane-at-a-time mobile flow with explicit back/navigation controls and preserved draft state.
- Clear new-conversation flow, request type, project context, save mode, send state, and resulting Artifact/Knowledge ownership.
- Semantic English/Thai chrome while preserving agent identity, messages, record titles, and server errors as source data.
- Focused empty, loading, sending, failure, and long-message states with bounded content and 44px controls.

### Constraints

- Preserve direct-agent APIs, session/message behavior, project binding, save modes, memory review boundaries, provider routing, RBAC, and secret handling.
- Do not turn direct chat into Work Order execution, external-agent dispatch, auto-patch, auto-push, PR, merge, or deploy.
- Keep generated Artifact and Knowledge Candidate ownership visible through links to their canonical pages; do not duplicate those records in chat state.
- Split route orchestration, controller/models, rails, conversation, composer, and dialogs below 600 lines where practical.

### Delivery Order

1. Merge current `main`, record Active Work ownership, and capture EN/TH baselines at 1440px, 1024px, and 430px.
2. Map session, message, project, artifact, knowledge-candidate, provider, and RBAC ownership.
3. Add focused tests for hierarchy, pane transitions, source links, save boundaries, errors, and Thai chrome.
4. Refine the page into responsive rails, conversation, context, and composer modules.
5. Run focused/full web tests, root typecheck/build, and responsive browser verification.

### Baseline

- Premium UX Waves 1, 2, 3, 4A, and 4B are complete.
- `codex/main` is synchronized with `main` at `dfa9201`, including M24 Phase B supervised auto-retry.
- `/agent-chat` is currently about 400 lines and has no focused page test.
- Latest frontend validation after Wave 4B: root typecheck/build and 199/199 web tests pass.
- Wave 4B live checks pass at 1440x900, 1024x768, and 430x932 in English/Thai without horizontal overflow.
