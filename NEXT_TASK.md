# Next Task

## Premium UX Wave 4D: Living Agents Roster

Status: **planned - not reserved**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`
Owner: Codex candidate on `codex/main`; mark active only after synchronizing the latest `main`

### Goal

Refine `/living-agents` into a compact operational roster where the King can scan real agent state, active assignment, health, and profile ownership without repeated decorative cards.

### Scope

- Compact roster with state, current activity, assigned work, health signal, and direct profile navigation.
- Filters for operational state and role while preserving canonical Agent identity and live activity ownership.
- Symmetric desktop density and a bounded mobile list/detail flow with English/Thai chrome.
- Motion only for real state changes, selection, filtering, focus, and reduced-motion-safe feedback.

### Constraints

- Preserve Agent, AgentActivity, WorkOrder, provider usage, health, RBAC, and portrait source-of-truth contracts.
- Do not infer operational work from ambient animation or presentation state.
- Keep summary rows read-only and link to the owning Agent, activity, Work Order, trace, or provider records.
- Split controller, models, roster, detail, filters, and messages below 600 lines where practical.

### Delivery Order

1. Merge current `main`, record ownership, and capture EN/TH baselines at 1440x900, 1024x768, and 430x932.
2. Map Agent identity, live state, activity, assignment, health, usage, and profile source ownership.
3. Add focused tests for filters, selection, source links, state labels, empty/error states, responsive handoff, and Thai chrome.
4. Implement the compact roster and focused operational detail without changing API contracts.
5. Run focused/full web tests, root typecheck/build, and responsive browser verification.

### Baseline

- Premium UX Waves 1, 2, 3, 4A, 4B, and 4C are complete.
- Wave 4C validation: 205/205 web tests, root typecheck, web lint, and root build pass.
- `/agent-chat` has no horizontal overflow at 1440x900, 1024x768, or 430x932 in English/Thai.
