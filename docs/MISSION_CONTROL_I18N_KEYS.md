# Mission Control i18n Key Inventory (M22 — Phase 1)

This is the per-page inventory of **semantic translation keys** for the Mission
Control surfaces. It exists so later pages can migrate incrementally without a
global rewrite, and so the "covered vs deferred" boundary is reviewable.

## How it works

- Keys + `en`/`th` values live in [`apps/web/src/lib/i18nMessages.ts`](../apps/web/src/lib/i18nMessages.ts).
- Components resolve a key with `const tk = useTk(); tk("inbox.title")`
  (`useTk` is exported from [`apps/web/src/lib/i18n.tsx`](../apps/web/src/lib/i18n.tsx)).
- `tk(key, vars)` supports `{name}` interpolation, falls back to the `en` value,
  then to the raw key (so a missing key is visible in dev, never blank).
- This is **additive**. The legacy whole-string display-text translator (`t` +
  the DOM `MutationObserver` in `i18n.tsx`) is untouched and still covers pages
  that have not migrated yet. Migrated pages render the target language directly
  from keys; the observer leaves that text alone because it is not in the legacy
  English→Thai dictionary.

## Invariants

1. Every `en` value equals the literal that was rendered before migration, so
   existing English assertions keep passing.
2. Enum/severity/state/risk badges render a **translated label** but keep the
   **raw enum value in the `title` tooltip** (e.g. `title="Risk: CRITICAL"`).
3. Server-provided prose is **data, not chrome** — it is never keyed.

## Covered in Phase 1

### Shared keys (used by both pages)

| Namespace | Keys | Notes |
|---|---|---|
| `provenance.*` | `source`, `generatedBy`, `related`, `updated` | `ProvenanceLinks` row labels |
| `risk.*` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` | raw enum kept in tooltip |
| `state.*` | `AWAITING_INPUT`, `AWAITING_DECISION`, `AWAITING_ACTION`, `BLOCKED` | inbox abstract state, raw enum in tooltip |
| `severity.*` | `CRITICAL`, `WARNING`, `INFO` | mission-control severity, raw enum in tooltip |
| `entity.*` | `WorkOrder`, `AutomationJob`, `PatchArtifact`, `AgentRunner`, `HandoffBrief`, `AgentKnowledgeCandidate`, `CouncilSession` | unknown types fall back to a humanized form |

### Dashboard (`/dashboard`, `dashboard.*`)

Covered: page eyebrow/title/description, `issueDecree`, panel title
(`missionControl`), `actionInbox`, `whatNext`, `openAction`, `openSource`,
`sourcePrefix`, `contextPrefix`, section titles (`section.*`), metric labels
(`metric.*`), all empty-state titles/descriptions (`mcUnavailable*`,
`noQueued*`, `noActive*`, `noReview*`, `noBlocked*`, `noRecent*`), `loading`,
`activityStream`, `operationsCenter`. State badges (`StatusBadge`) now carry the
raw enum (`item.status`) in their tooltip.

### Inbox (`/inbox`, `inbox.*`)

Covered: page eyebrow/title/description (full + short), refresh/retry buttons,
computed/no-auto-polling bar, error state (`unavailable*`, `contextNotFresh`),
summary stat labels (`stat.*`), `topActionTitle`, empty state, `whyLabel`,
`recommendedAction`, `sourceOfTruth`, `openEntity`, `priorityScore`, `observed`,
`priorityAria`, `openSource`, `priority`, filter panel (`filters`, `filterRisk`,
`allRisks`, `filterEntity`, `allEntities`, `escalatedOnly`, `blockedOnly`,
`clearFilters`), status badges (`escalated`, `blocking`), source-reference cards
(`sourceRefTitle`, `source.<Type>.label`/`.desc`), action-queue header
(`actionQueueTitle`, `totalCount`, `noMatch*`), risk-group titles
(`riskGroup.*`), and relative age (`age.m`/`age.h`/`age.d`). Risk/state/entity
badges keep the raw enum in their tooltips.

## Deferred (intentionally NOT keyed in Phase 1)

- **Server-provided prose**: a record's `title`, `detail`, `nextAction`,
  `summary`, `why`, `actionLabel`, agent/runner names, and warning text. These
  come from the API (`getMissionControl`, `getNextActions`, …) and are data.
- **Dashboard state-badge visible label**: `displayState`/`currentState` are
  already human-readable strings produced server-side. Phase 1 only adds the
  raw-enum tooltip; a full enum→`th` mapping of server display states is
  deferred.
- **Mission-control "Source:" entity identifiers** (`NextActionQueue`,
  `AgentReviewSummary`, `AgentActivity`, …): technical source identifiers shown
  after the translated `Source:` prefix; left raw on purpose.
- **`ProvenanceLinks` source-link *text*** (e.g. `AgentKnowledgeCandidate #pending`):
  built by `provenanceFromNextAction`/`provenanceFromActivity` as
  `` `${entityType} #${id}` `` — a raw entity type + short id used as the link
  label. The row *labels* (Source/Updated/…) are keyed; the link text itself is
  pre-existing identifier text and is the one place a raw enum is still the
  primary visible label. Deferred: routing this through the `entity.*` keys is a
  follow-up (it touches the shared adapter, used well beyond these two pages).
- **`KingdomHealthStrip` and `KingdomActivityFeed`**: rendered on the Dashboard
  but own their own labels; they are separate components and migrate in a later
  phase.
- **Shared `timeAgo` / `formatDate` in `lib/utils`**: used across the whole app;
  migrating them is a global change kept out of this page-scoped phase. (The
  Inbox-local `formatAge` *is* keyed via `inbox.age.*`.)
- **`LivingLoopDashboardCard` / `MetricReviewCard`**: defined in
  `DashboardPage.tsx` but not rendered by the Dashboard view (only exported for
  the Living Loop card test) — out of scope for this page.

## Adding the next page

1. Add a `<page>.*` namespace block to both `en` and `th` in `i18nMessages.ts`,
   keeping each `en` value equal to the current literal.
2. Replace literals with `tk("<page>.<key>")`; for badges, keep the raw enum in
   `title`.
3. Add an English + Thai test (reset `localStorage` in `beforeEach`/`afterEach`;
   set `LANGUAGE_STORAGE_KEY` to `"th"` for the Thai case) asserting both
   languages and that source links/routes are unchanged.
4. Append the page to the "Covered" section above.
