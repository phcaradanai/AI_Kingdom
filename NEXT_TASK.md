# Next Task

## M17D-4: Daily Royal Brief + Living Agent Activity Digest

Goal: give the King a single daily summary of what the Living Loop observed, proposed, auto-validated, auto-patched, and what still needs review — without adding any new automated write/push/merge capability.

## Scope

1. **Daily Digest Generation**: extend `royalSecretaryService.ts` (or a new `livingActivityDigestService.ts`) to summarize, per day: Living Loop runs, candidates proposed/approved/rejected/skipped (with top skip reasons), auto-created `VALIDATION_ONLY` and `SANDBOX_PATCH` jobs, job outcomes (PASSED/FAILED/NEEDS_REVIEW), and `PatchArtifact` review status counts.

2. **Daily Brief Integration**: surface the digest in `generateDailyBrief()` / `GET /api/secretary/brief`, and as a `Notice` (INFO severity) when there is new Living Loop activity since the last digest, with 24h dedup.

3. **Dashboard / Living Loop Page**: add a "Today's Living Agent Activity" panel summarizing the digest (counts + top skip reasons + link to Patches Needing Review).

4. **Tests**:
   - digest aggregation correctness for a mix of candidates/jobs/patches across a day boundary
   - daily brief includes the digest summary
   - notice dedup (no duplicate digest notices within 24h)
   - dashboard/living-loop page renders the digest panel

5. **Documentation**: update PROJECT_STATUS.md, ARCHITECTURE.md, and NEXT_TASK.md (set next milestone) when complete.

## Constraints

- No new auto-act capability: this milestone is read/summarize only.
- No branch push, PR creation, merge, or deploy — unchanged from M17D-3.
- `LIVING_LOOP_AUTO_SANDBOX_PATCH` and `LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS` remain opt-in and default disabled.
- Root `npm run test`, `npm run typecheck`, and `npm run build` must pass before completion.
