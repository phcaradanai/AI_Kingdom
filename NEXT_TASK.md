# Next Task

## Premium UX Wave 4E: Living Agent Evidence Profile

Status: **planned - not reserved**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`
Owner: Codex candidate on `codex/main`; mark active only after synchronizing the latest `main`

### Goal

Refine `/living-agents/:agentId` from an 876-line, 12-tab page into a focused evidence profile where identity, current state, work, provenance, usage, relationships, and learned knowledge remain easy to scan and trace to their owners.

### Scope

- Stable profile header with canonical identity, current activity, operational state, and source ownership.
- Consolidate the 12 tabs into a smaller evidence hierarchy: Overview, Timeline, Work & Relationships, Usage & Traces, and Knowledge & Audit.
- Preserve lazy timeline/relation loading, filters, trace/report/project/council/memory/knowledge links, and server-owned data.
- Responsive one-section-at-a-time mobile flow with semantic English/Thai chrome and 44px controls.

### Constraints

- Preserve all Living Agent profile, timeline, and relations APIs and DTO contracts.
- Do not reinterpret legacy attribution as verified evidence or infer active work from historical records.
- Keep Agent, AgentActivity, WorkOrder, Project, Council, Report, Memory, Knowledge Candidate, Provider, Usage Trace, and Audit Log ownership explicit.
- Split controller, models, header, navigation, evidence sections, timeline, relations, messages, and tests below 600 lines.

### Delivery Order

1. Merge current `main`, record ownership, and capture EN/TH baselines at 1440x900, 1024x768, and 430x932.
2. Map the 12 existing tabs and every link/query to the five-section evidence hierarchy.
3. Add focused tests for section navigation, lazy loads, filters, source links, legacy attribution, loading/error/empty states, and Thai chrome.
4. Implement the split profile workspace without backend or DTO changes.
5. Run focused/full web tests, root typecheck/build, and responsive browser verification.

### Baseline

- Premium UX Waves 1, 2, 3, and 4A-4D are complete.
- Wave 4D validation: 211/211 web tests, root typecheck, web lint, and root build pass.
- `/living-agents` has no horizontal overflow at 1440x900, 1024x768, or 430x932 in English/Thai; browser console is error-free.
