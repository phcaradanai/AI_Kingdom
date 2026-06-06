# Next Task

## M15: Project-Aware Council and Work Review Polish

Goal: make project routing easier to audit and improve the review loop for project-linked council output and external work.

## Scope

1. **Routing Review History**: add a project routing history panel showing candidates, confidence scores, reasons, and final decisions.

2. **Project-Aware Council UI**: show linked project context in Throne Room and Council detail views, including the no-project warning when unassigned.

3. **Work Order Review Queue**: add KING/CROWN_PRINCE review actions for implementation reports and handoff briefs.

4. **Secretary Signals**: create notices when project inbox items stay pending too long or work orders remain in `IN_PROGRESS` / `NEEDS_REVIEW`.

5. **External Agent Templates**: add reusable prompt templates per external agent type without automating external agents.

6. **Tests**: routing history, project context display, review queue permissions, stale-item notices, and prompt template rendering.

7. **Documentation**: update PROJECT_STATUS.md, ARCHITECTURE.md, NEXT_TASK.md, and README.

## Constraints

- No vector database yet.
- No autonomous background workers yet.
- No backend shell command execution.
- No Claude Code/Codex/Cline/Kilo/Antigravity/Hermes/OpenCode API calls.
- AI Kingdom remains the source of truth; external agents remain executors.
