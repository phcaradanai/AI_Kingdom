# Active Work Coordination

This file records work currently in progress so contributors can avoid overlapping edits. Add an entry before implementation, update it when scope or branch changes, and move it to the completed section after delivery is recorded in `PROJECT_STATUS.md`.

## Active

No active Codex work.

## Recently Completed

| Status | Owner | Branch | Base | Completed | Scope |
| --- | --- | --- | --- | --- | --- |
| COMPLETE | Codex | `codex/main` | `main` at `655e658` | 2026-06-23 | Premium UX Wave 4B: External Agents Registry |

### Wave 4B Delivery

- Rebuilt `/external-agents` as a compact registry and selected-detail workspace with live readiness evidence, capability/handoff views, configuration-only validation, and canonical source links.
- Moved King-only create/edit actions into focused dialogs and added an explicit soft-delete confirmation without changing API, RBAC, runner, lifecycle, secret, or manual-handoff contracts.
- Added semantic English/Thai chrome and responsive EN/TH checks at 1440x900, 1024x768, and 430x932.
- Split the route, controller, models, registry, detail, workspace, and dialogs so each implementation module remains below 220 lines.
- Validation: focused tests 8/8, full web tests 199/199, root typecheck, production build, and browser QA pass.
