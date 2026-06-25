# Work In Progress - Team Coordination

This is the canonical board for who is working on what and on which branch. Update your own entry before implementation, when scope changes, and after the work is merged. Detailed Codex scope lives in `docs/ACTIVE_WORK.md`; completed history lives in `PROJECT_STATUS.md`.

Division of labor: **Codex owns UX/UI**, **Claude owns the core system** (`claude/main`). Integrate through `main`.

## Active Now

### Codex - `codex/main`

- No active implementation. **Premium UX Wave 4F: Providers Registry** is complete on `codex/main` and ready for merge/integration tracking.
- Completed scope: replaced the repeated provider-card grid with a compact registry plus focused provider evidence/configuration workspace, semantic English/Thai chrome, 44px controls, explicit Routing/Treasury source links, and secret-reference-safe provider creation/editing.
- Preserved Provider registry/config ownership, model validation, health/account/model telemetry, KING RBAC, routing, cost, audit, and secret-handling contracts. No API, DTO, Prisma, or backend secret resolution changed.
- Next reserved Codex candidate: **Premium UX Wave 4G: Routing Workspace** after merging latest `main` into `codex/main` again.

### Claude - `claude/main`

- **End-to-end verification of the learning loop** (✅ merged to `main`) — `learningLoopE2E.test.ts` (backend-only). Forces all gating settings ON, forces the sandbox/mock provider (clears env credentials so the route can't take the real OpenRouter key), and spies on the real provider input (`MockAIProvider.prototype.generateAgentResponse`) to prove the seeded past lesson + approved curated knowledge actually reach the council prompt (a specialist AND the synthesis), and that a fresh failed review captures a PENDING candidate. Closes the "all levers on but never proven together" gap. 1/1 green in ~6s.
- **Self-sustaining learning loop** (✅ merged to `main`) — `CAPTURE_LESSONS_FROM_REVIEWS`: a diagnosed failed review (`createOrUpdateAgentReviewForJob`) auto-proposes a PENDING knowledge candidate (BUG_LEARNING) → King approves → feeds back into council + planner via `AGENT_KNOWLEDGE_IN_CONTEXT`. Full cycle: decree → execute → review → lesson → approve → smarter reasoning. King-gated, best-effort, value-gated.
- **Curated knowledge in council + planner** (✅ merged to `main`) — `AGENT_KNOWLEDGE_IN_CONTEXT`: each agent's APPROVED M16 knowledge injected into its council prompt + the synthesis (`grandVizierOrchestrator`), and the planner agent's into the planning context (`[APPROVED KNOWLEDGE]`), via `buildAgentKnowledgeContext`. Closes the loop where approved knowledge was created but never used.
- **Cross-task learning** (✅ merged to `main`) — `crossTaskLearningService.ts`. Relevance-ranked, outcome-gated lessons (what worked / what to avoid) from past review outcomes, injected into both the **planner** (`PLANNER_CROSS_TASK_LEARNING`) and the **council** (`COUNCIL_CROSS_TASK_LEARNING`). Deterministic, no extra AI call. Backend-only.
- **Council parallelization** (✅ merged to `main`) — `grandVizierOrchestrator.ts`, setting `COUNCIL_PARALLEL_SPECIALISTS`. Live A/B ~356s → ~173s. Details in `PROJECT_STATUS.md`.
- M24 Phase B supervised auto-retry merged to `main`; details in `PROJECT_STATUS.md`.
- **Settings posture:** all intelligence levers ON in dev (`npm run intelligence:enable`). Autonomy mostly ON; King kept `COUNCIL_AUTO_EXECUTE_LOW_RISK` OFF (decree→execute stays manual), enabled `LIVING_LOOP_AUTO_CONTEXT_REPAIR`.
- **Prove + measure + prune (King chose this 2026-06-25). Phase 2+3 DONE: live verify + prune** — Live decree (2026-06-25): fallbackNotice=none (43% fallback was fully historical), provider=OpenRouter/deepseek-v4-flash, cost=$0.004067. useCount 0→21 confirms AGENT_KNOWLEDGE_IN_CONTEXT delivers knowledge to prompts. BUT mechanism ≠ benefit: all 19 approved items are synthesis-captures (`createCouncilLearningCandidate`) titled "Learning candidate from [task title]" with content "Failure pattern: [decree text] / Evidence: [council output]" — the council's own output relabeled as lessons (circular, low-signal). The 16 with useCount=0 are not project-silo; they're frozen out by the 1500-token budget (each item ~500 tokens → only 3 fit; top-3 by useCount monopolize slots forever). **Prune executed (full)**: (1) deleted the 19 polluted `agentKnowledgeMemory` items; (2) gated `createCouncilLearningCandidate` behind `COUNCIL_SYNTHESIS_CAPTURE` (default OFF) so no new synthesis candidates are *created*; (3) **deleted all 30 `COUNCIL_SESSION` candidate rows** (19 orphaned-APPROVED + 1 REJECTED + 10 PENDING) — the creation gate does NOT cover the *approval* path (`approveKnowledgeCandidate` re-materializes a candidate into a memory without re-checking the setting), so the 10 PENDING were still approvable pollution and the 19 APPROVED orphans were inflating the dashboard against 0 backing memories. Verified clean via `intelligence:measure`: candidates=none, approved knowledge=0. Only `CAPTURE_LESSONS_FROM_REVIEWS` (sourceType `AGENT_REVIEW`, runner failure diagnosis — high-signal) will feed the pool now; its content/summary carry the reviewer's real `whatFailed` diagnosis (title is cosmetic). The full E2E (decree→review→lesson→approve→useCount↑) is already proven by `learningLoopE2E.test.ts`. **Benefit signal is longitudinal, not one-shot**: watch review verdict PASS-rate trend (currently PASS=3, no failures yet) across future decrees via `intelligence:measure` — no cheap A/B shortcuts it.

## Collision Watch

- M24 Phase B touched `apps/web/src/lib/api.ts`, `apps/web/src/lib/i18nMessages.ts`, and `AutomationJobsPage.tsx`; Codex has merged those changes before Wave 4C planning.
- Wave 4F is complete and made no backend/API/type changes. Wave 4G should avoid backend/API/type changes unless a verified contract gap blocks the routing UX. Any contract change must be coordinated before implementation.
- `apps/web/src/lib/i18nMessages.ts` remains a shared integration point. Future waves should use scoped message modules and keep central registration minimal.
- Claude intelligence/learning-loop work is backend-only; no expected overlap with the planned Wave 4G routing surface except shared status documentation.

Last updated: 2026-06-25 by Codex after Wave 4F completion on `codex/main`.
