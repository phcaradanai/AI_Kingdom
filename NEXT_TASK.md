# Next Task

## Premium UX Wave 4B: External Agents Registry

Status: **planned - ready to implement**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`

### Goal

Turn `/external-agents` into a focused manual-handoff registry. The King should compare availability, capabilities, execution mode, test status, and ownership boundaries without scanning repeated forms or mistaking advisory metadata for an executable integration.

### Scope

- Compact searchable registry with active state, capabilities, execution mode, test status, and attention signal.
- Selected external-agent detail with clear Identity, Capabilities, Handoff, Validation, and Source views.
- Explicit create/edit dialogs and deliberate destructive confirmation.
- Direct links to Work Orders, Automation Jobs, and source evidence where current contracts provide identifiers.
- Semantic English/Thai chrome while keeping names, command templates, identifiers, and server validation messages as source data.

### Constraints

- Preserve manual-handoff-only behavior. Do not add backend command execution, filesystem access, proprietary external-agent API calls, auto-patch, auto-push, PR creation, merge, or deploy.
- Preserve existing external-agent APIs, environment gates, command templates, lifecycle, RBAC, and secret handling.
- Do not invent availability or test results; show only stored or computed source data.
- Keep required safety boundaries and validation evidence in normal document flow.
- Split route orchestration, controller/models, registry/detail, and dialogs below 600 lines where practical.

### Delivery Order

1. Capture `/external-agents` baselines at 1440px, 1024px, and 430px in English and Thai.
2. Map registry, capability, execution-mode, validation/test, Work Order, and RBAC ownership.
3. Add focused tests for hierarchy, manual-only boundaries, source links, explicit mutations, and Thai chrome.
4. Refine the page into registry plus focused detail and dialog flows.
5. Run focused/full web tests, root typecheck/build, and responsive browser verification.

### Baseline

- Premium UX Waves 1, 2, 3, and 4A are complete.
- `/external-agents` is currently 218 lines and has no focused page test.
- Latest validation: root typecheck, root production build, and 185/185 web tests pass.
- Wave 4A live checks pass at 1440x900, 1024x768, and 430x932 in English/Thai without horizontal overflow.
