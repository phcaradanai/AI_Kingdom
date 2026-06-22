# Next Task

## Premium UX Wave 4A: Agents Registry

Status: **planned - ready to implement**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`

### Goal

Turn `/agents` into a focused agent registry and configuration workspace. The King should identify each agent's canonical identity, operating role, profile source, prompt, skills, routing, fallback readiness, and validation state without scanning one oversized form.

### Scope

- Compact agent list with identity, state, role, provider/model route, and attention signal.
- Focused selected-agent detail organized into Identity, Prompt, Skills, Routing, Fallbacks, and Preview views.
- Explicit create/edit configuration flows with validation adjacent to the affected routing row.
- Preserve `Agent` operational identity and `Agent.config.displayProfile` presentation ownership established by the source-of-truth repair.
- Direct links to Living Agent profile, provider/model ownership, routing evidence, usage traces, and related work where current contracts provide identifiers.
- Semantic English/Thai keys for static chrome; agent names, prompts, identifiers, provider/model names, and server-provided validation messages remain source data.

### Constraints

- No backend, Prisma, agent lifecycle, provider routing, fallback validation, memory safety, RBAC, or secret-handling contract changes.
- Do not duplicate profile data or infer portraits from names. Saved display profile data remains authoritative.
- Keep routing validation visible, debounced, stale-result-safe, and non-blocking on save.
- Required configuration and validation evidence must remain in normal document flow, not a carousel.
- Split route orchestration, controller hooks, pure models, registry/detail views, and dialogs. Replace the current 1,740-line page with files below 600 lines where practical.

### Delivery Order

1. Capture `/agents` baselines at 1440px, 1024px, and 430px in English and Thai.
2. Map profile, routing, validation, fallback, provider/model, and RBAC ownership before changing composition.
3. Add focused tests for registry hierarchy, authoritative profile rendering, validation feedback, source links, explicit mutations, and mobile-safe rendering.
4. Refine the page into registry plus focused configuration views and split the oversized component.
5. Run web typecheck, full web tests, production build, reduced-motion checks, and responsive browser verification.

### Acceptance

- The King can identify an agent's role, health, effective route, validation state, and owning source from one focused workspace.
- Identity, prompt, skills, routing, fallbacks, and preview have distinct predictable views.
- Saved profile/avatar data remains authoritative across Agents and linked Living Agent surfaces.
- Mutations remain role-gated and existing routing/fallback behavior is unchanged.
- English and Thai labels do not overlap, clip, or widen the page.

### Baseline

- Premium UX Waves 1, 2, and 3 are complete.
- `/agents` is currently 1,740 lines and is the largest remaining agent configuration surface.
- Latest web validation: 182/182 tests, root typecheck, and root production build pass.
- Wave 3C live checks pass at 1440x900, 1024x768, and 430x932 in English/Thai without horizontal overflow or console errors.
