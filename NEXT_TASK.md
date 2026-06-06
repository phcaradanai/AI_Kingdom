# Next Task

## M13: Royal Secretary Intelligence

Goal: give the Secretary the ability to generate AI-assisted briefings and connect kingdom signals to actionable notices and matters automatically.

## Scope

1. **Secretary AI Briefing**: `POST /api/secretary/brief/generate` — runs an AI council call (using the existing orchestrator infrastructure) to produce a written analysis of the current kingdom status. Stores result as a `Report` with category `GENERAL`. KING only.

2. **Signal-to-Notice Wiring**: After every completed council session, the orchestrator checks for warning signals (budget warning, failed tasks threshold) and auto-creates `Notice` records via `royalSecretaryService.createNotice`. No new background workers — runs inline in the orchestrator.

3. **Matter Escalation**: When a `Notice` is marked CRITICAL by the King, the system offers (via API) to auto-elevate it to an `AWAITING_ROYAL_DECISION` matter.

4. **Notice Count Badge**: Add an unread notice count to the nav sidebar (fetched alongside the secretary brief).

5. **Tests**: signal-to-notice wiring, matter escalation from notice, briefing generation, badge count.

6. **Documentation**: Update PROJECT_STATUS.md, ARCHITECTURE.md, NEXT_TASK.md.

## Constraints

- No autonomous background workers.
- No ministry hierarchy.
- No external monitoring vendors.
- All wiring must be inline in existing flows (orchestrator, API handlers).
