# Next Task

## M14: External Agent Automation Readiness

Goal: prepare the M13 External Agent Bridge for future automation while keeping manual copy-paste mode safe as the default.

## Scope

1. **Work Order Review Queue**: add KING/CROWN_PRINCE review actions for implementation reports and handoff briefs.

2. **External Agent Templates**: add reusable prompt templates per external agent type.

3. **Safer Report Parsing**: parse external agent final responses into `ImplementationReport` drafts without executing anything.

4. **Secretary Signals**: create notices when work orders are stuck in `IN_PROGRESS` or `NEEDS_REVIEW`.

5. **Tests**: review queue permissions, template rendering, parser redaction, stale work-order notices.

6. **Documentation**: Update PROJECT_STATUS.md, ARCHITECTURE.md, NEXT_TASK.md.

## Constraints

- No autonomous external agent execution.
- No backend shell command execution.
- No Claude Code/Codex/Cline API calls.
- Keep AI Kingdom as source of truth; external agents remain executors.
