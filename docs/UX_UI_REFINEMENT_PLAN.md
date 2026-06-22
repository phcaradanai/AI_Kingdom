# UX/UI Refinement Plan

Date: 2026-06-21

Scope: visual system, application shell, responsive behavior, and page-by-page refinement for all routes in `apps/web/src/main.tsx`.

This plan changes presentation and interaction hierarchy only. It does not change route ownership, backend contracts, RBAC, WorkOrder lifecycle rules, runner safety gates, or Mission Control source-of-truth boundaries.

## Outcome

AI Kingdom should feel like a premium operational control plane: quiet, precise, balanced, and easy to scan repeatedly. Premium here means disciplined spacing, typography, alignment, hierarchy, and interaction states. It does not mean more glow, more gradients, larger headings, or putting every section in a decorative card.

The King should be able to answer these questions without hunting:

1. What needs attention now?
2. What is running, blocked, or waiting for review?
3. Which record owns this information?
4. What is the next safe action?

## Current Baseline

- 39 user-facing routes: 38 authenticated routes plus `/login`.
- Six sidebar groups with up to 32 visible links for a King account.
- Desktop shell uses a persistent 256px navigation panel that can collapse to an 80px icon rail; the preference is stored locally per browser.
- Mobile navigation uses a full-height drawer and keeps the current domain and page visible in the mobile header.
- Content width is route-aware (`compact`, `standard`, and `wide`) rather than forcing every page into one maximum width.
- Surface primitives are visually inconsistent: `Card` uses `rounded-lg`, while `SectionCard` and `StatCard` use `rounded-xl`; shadows, borders, and backgrounds also differ.
- Many compact labels use uppercase plus wide tracking, which is fragile in Thai.
- The largest pages are difficult to keep visually coherent: Work Orders (1,873 lines), Agents (1,739), Treasury (1,326), Automation Jobs (1,105), and Throne Room (944).
- All five Mission Control pages and their shared Health/Activity components use semantic English/Thai keys for static chrome; server-provided prose remains source data.

Rendered verification is available. The responsive shell has been checked at 1440x900 and 430x932, including expanded/collapsed desktop navigation, the mobile drawer, and horizontal-overflow checks. The current development endpoints are the web app at port 5173 and API health at port 4000. Each implementation wave still requires fresh rendered checks before acceptance.

## Visual Direction

### Layout geometry

- Use a 12-column desktop grid with stable gutters and three explicit page widths:
  - `compact`: forms and focused reading, approximately 760-880px.
  - `standard`: lists and operational dashboards, approximately 1120-1280px.
  - `wide`: dense comparison and execution surfaces, approximately 1360-1480px.
- Keep primary content aligned to one left edge across the page header, toolbar, metrics, and body.
- Use a spacing rhythm of 4, 8, 12, 16, 24, 32, and 48px. Avoid one-off margins.
- Keep repeated metric and queue rows at stable heights. Dynamic labels must wrap inside their own region without shifting adjacent controls.
- Use 8px or smaller radii for cards and panels. Pills remain reserved for status, compact filters, and counts.
- Treat empty space as intentional structure. In a shared row, related panels must use matched grid tracks and equal visual height, or recompose into a dominant main area plus a deliberately sized rail. Do not leave one long panel beside an unrelated short box with accidental dead space below it.
- Prefer one strong content region and one supporting region over several uneven boxes. When content lengths differ substantially, stack sections or give each region independent scroll ownership instead of forcing a visually broken side-by-side composition.

### Surface hierarchy

- Level 0: page background and unframed page sections.
- Level 1: bordered operational panels for a real tool, form, table, or repeated entity.
- Level 2: selected/active rows and modal surfaces only.
- Do not nest decorative cards. Use dividers, bands, and grouped rows inside a panel.
- Reduce always-on blur and glow. Reserve a restrained brass highlight for focus, selection, and the single primary action.
- Replace the current dark-blue-dominant background with a neutral graphite/ink base, warm brass identity accent, cool gray structure, and semantic green/amber/red status colors.
- Remove decorative radial/gradient atmosphere from routine work pages. The visual identity should come from type, proportion, iconography, and material contrast.

### Typography

- Keep the display face for the product name and major Kingdom document titles only.
- Use the interface sans-serif for page titles, section titles, tables, forms, and controls.
- Reduce uppercase labels and wide tracking, especially for Thai. Use sentence case for navigation, field labels, section headings, and card titles.
- Standardize type roles: page title, page description, section title, body, metadata, and audit/code text.
- Keep page titles operational in scale. Dense tools should not use hero-sized headings.

### Interaction and responsive behavior

- Replace the mobile all-route pill strip with a menu button and full-height navigation drawer.
- Add contextual sub-navigation or tabs within large domains instead of exposing every child route at the same sidebar level.
- Standardize page actions: one primary command, secondary outline commands, destructive actions in a menu or confirmation flow.
- Use icon buttons with Lucide icons for familiar tools such as refresh, edit, archive, copy, close, and expand; include tooltips where meaning is not obvious.
- Standardize loading, empty, error, disabled, selected, hover, focus-visible, and stale-data states.
- Keep all source/provenance links visible and preserve raw enum values in tooltips where audit evidence requires them.
- Desktop navigation must remain collapsible to an icon rail with accessible names, native tooltips, visible active state, and a persistent user preference. The collapsed state must never remove a route or change RBAC visibility.
- Real-time cues must be tied to real state. Polling badges, activity pulses, progress, and event insertion motion may show fresh data, but decorative animation must never imply an agent is working when no such state exists.

### Expressive premium system

Use the full interaction toolkit where it improves orientation, feedback, or task speed. The app should feel alive without making repeated operational work slower or less legible.

#### Motion and micro-interactions

- Define three motion durations: `fast` (100-140ms) for hover, press, and focus feedback; `standard` (180-240ms) for disclosure and state changes; `slow` (280-360ms) for drawers, dialogs, and major view transitions.
- Animate opacity and transform by default. Avoid layout-heavy animation of width, height, top, or left when a transform-based transition can communicate the same change.
- Use restrained entrance sequencing only for first-load summaries and newly inserted records. Repeated list navigation, filtering, and polling refreshes must not replay page-wide animation.
- Give buttons, rows, tabs, toggles, status indicators, copy actions, disclosures, and drag handles clear hover, active, focus, loading, success, and failure feedback.
- Use skeletons for predictable loading geometry, optimistic feedback only for reversible actions, and visible progress for operations whose completion is not immediate.
- Respect `prefers-reduced-motion`: remove parallax, sequencing, and large transforms while retaining instant state feedback and focus visibility.

#### Depth and z-index

- Use a documented layer scale: base content, sticky page chrome, dropdown/popover, drawer, modal, toast, and critical confirmation. No arbitrary one-off z-index values.
- Create depth with border contrast, small tonal shifts, controlled shadow, and overlap only when the relationship is meaningful. Do not simulate depth by stacking decorative cards.
- Sticky headers, action bars, and detail rails must use an opaque or sufficiently solid backdrop so text never collides visually with scrolling content.
- Reserve the strongest elevation for modal decisions and destructive confirmations. Hover elevation on rows and cards should remain subtle and must not shift layout.

#### Color, shape, iconography, and type

- Use graphite/ink neutrals for structure, warm brass for Kingdom identity and primary focus, cool cyan/blue for informational state, and semantic green/amber/red for health and risk.
- Combine color with icon, text, or shape for every status. Color alone must never carry approval, failure, or blocked meaning.
- Keep panel geometry rectilinear and precise. Use compact radius, clipped accent rails, dividers, status dots, and progress lines to create character without decorative blobs or oversized pills.
- Use Lucide icons consistently at stable 16/18/20px sizes. Icon-only controls require an accessible name and tooltip; text remains present for unfamiliar or high-consequence commands.
- Use tabular numerals for metrics, timestamps, cost, token, and queue counts. Thai and English share the same semantic type roles, but line-height and wrapping must be verified independently.

#### Modals, drawers, and carousels

- Use a modal for focused confirmation or short creation/edit tasks that should temporarily block the underlying page.
- Use a side drawer for contextual detail, filters, configuration, and mobile navigation where preserving the current list or source context matters.
- Keep primary detail routes for deep, linkable, or audit-heavy records. A drawer must not hide provenance, replace browser history, or become the only way to reach source evidence.
- Use carousels only for bounded, visual, optional content such as agent presence or onboarding-like previews. Queues, decisions, reports, metrics, and audit records stay as lists, grids, tabs, or timelines so nothing important is hidden off-screen.
- Every carousel requires visible position, previous/next controls, keyboard operation, touch support, pause behavior for autoplay, and a non-carousel layout at breakpoints where all items can fit cleanly.

#### Responsive composition

- Design each operational pattern for wide desktop, compact desktop/tablet, and mobile instead of only stacking desktop columns.
- Recompose master-detail layouts into list then detail, move secondary filters into drawers, and turn wide data tables into deliberate mobile row summaries with access to full detail.
- Keep touch targets at least 44px on mobile and preserve a stable command area above the fold. Sticky controls must not cover the final row or conflict with safe-area insets.
- Use container-aware grids, `minmax(0, 1fr)`, explicit aspect ratios where media exists, and overflow ownership so translated text cannot widen the page or clip controls.
- Verify responsive behavior at 1440x900, 1024x768, 768x1024, 430x932, and 390x844, including English, Thai, keyboard focus, 200% zoom, and reduced motion.

## Foundation Components

Implement these before polishing individual pages:

1. `AppShell`: desktop sidebar, mobile drawer, responsive content widths, current-domain context.
2. `PageLayout`: `compact`, `standard`, and `wide` variants with consistent vertical rhythm.
3. `PageHeader`: responsive title/action alignment, optional breadcrumbs, optional tabs, no forced uppercase.
4. `PageToolbar`: search, filters, result count, view controls, and primary action in a stable row.
5. `Section`: unframed section heading and content spacing.
6. `Panel`: restrained tool/list/form container replacing overlapping `Card`/`SectionCard` styles.
7. `MetricStrip`: equal-height metrics with compact labels and semantic deltas.
8. `DataList` and `DataTable`: shared row density, selection, empty state, mobile fallback, and pagination.
9. `DetailRail`: consistent metadata, provenance, status, and related-record links.
10. `ActionBar`: sticky or local action area for review/approval flows.
11. `Tabs` and `SegmentedControl`: domain views and compact modes.
12. `Drawer`, `Dialog`, `Tooltip`, and `Toast`: one accessible overlay system with shared focus, escape, layering, and responsive behavior.
13. Motion tokens and interaction-state utilities with reduced-motion fallbacks.
14. Shared display maps for status, risk, health, and entity labels in English and Thai.

Do not create a general component library in one large rewrite. Add each primitive when the first wave proves its API, then reuse it in later waves.

## Navigation Target

Keep all current routes during refinement. Change grouping and hierarchy before considering redirects.

| Domain | Primary destinations | Secondary destinations |
| --- | --- | --- |
| Mission Control | Overview, Action Queue | Operations, Royal Brief, Living Loop |
| Command | Throne Room, Work Orders | Council, Reports, Automation Jobs |
| Workspace | Projects, Strategy | Project Inbox, Artifacts |
| Agents | Agents, Agent Chat | External Agents, Living Agents |
| Providers & Models | Providers, Routing | Treasury, Usage Trace detail |
| Knowledge | Knowledge Lab, Institutional Memory | Charter, Vision |
| Administration | Matters, Notices, Settings | Users, Audit, Security, Profile |

Desktop sidebar: show domain-level destinations and expandable children. Mobile: use a drawer with the same hierarchy. Do not render more than one horizontal row of local tabs; overflow becomes a menu.

## Page-by-Page Plan

### Wave 1: Foundation and Mission Control

Progress: **Wave 1 complete** — application shell, navigation hierarchy, shared visual primitives, all five Mission Control surfaces, and semantic English/Thai keys for their static chrome. Source links, raw-enum tooltips, and server-provided prose boundaries are preserved.

| Route | Primary refinement |
| --- | --- |
| `/dashboard` | Use a strong top-action band, compact health strip, and balanced two-column operational sections. Reduce repeated card borders and keep every item source-linked. |
| `/inbox` | Make the queue the dominant surface: stable filter rail on wide screens, compact filter drawer on mobile, consistent row anatomy, and one clear action per row. |
| `/kingdom/operations` | Build a symmetric three-zone layout for presence, current operations, and activity. Use equal row heights and reduce decorative agent-card effects. |
| `/royal-brief` | Present a dated executive document with a clear generated timestamp, decision rail, and source-linked sections. Visually distinguish historical digest content from live state. |
| `/living-loop` | Group controls into Status, Safety, Automation Stages, Candidate Queue, and History. Replace dense inline metric grids and raw JSON blocks with disclosure panels. |

Wave 1 semantic i18n is complete for Operations, Royal Brief, Living Loop, Kingdom Health, and Activity Feed.

### Wave 1B Layout Contract

- Operations uses three equal-height desktop zones for agent presence, current operations, and activity. Each zone scrolls internally at wide breakpoints; mobile keeps natural document flow.
- Royal Brief uses a dated document column plus a sticky decision rail. Operational snapshots expose direct source links to Work Orders, Automation Jobs, Providers, and Living Agents.
- Living Loop follows one stable sequence: Status and Safety, Automation Stages, Candidate Queue, and Run History. Settings and raw run details use disclosure controls so review work remains dominant.
- Existing API calls, refresh behavior, context repair, candidate approval/apply actions, RBAC, provenance, runner boundaries, and source ownership remain unchanged.

### Wave 2: Command-to-Execution Lifecycle

Progress: **Wave 2 complete** - Throne Room, Council, Work Orders, Automation Jobs, Reports, and Decree Lineage now share the premium command-to-evidence hierarchy, semantic English/Thai chrome, explicit source ownership, focused interaction coverage, and responsive live verification.

### Wave 2A Layout Contract

- Live Kingdom motion enhancement is complete. The scene now uses a lightweight deterministic movement loop with role-owned room bounds, real-state activity signals, reduced-motion freeze, canonical portraits, and semantic English/Thai chrome. Ambient idle walking is presentation only; `Kingdom Presence` remains the source of truth and no new execution or lifecycle state was introduced.
- Throne Room keeps Live Kingdom and Command as separate views. Command intent links still open `?view=command`; the Command view puts decree entry and its single `Issue Decree` action above mode configuration and historical output.
- `BUILD` is the durable default command mode. ASK, PLAN, RESEARCH, and BUILD remain available in a compact advanced disclosure with visible descriptions; changing mode never submits or mutates data.
- The latest council result is a bounded operational area ordered as progress, final recommendation, next safe action, source-of-truth links, context warning, and role evidence. Existing execution, handoff, report, trace, project, and work-order behavior remains unchanged.
- Council uses a real master-detail archive. The session rail owns selection and chronology; the detail pane owns source decree, synthesis, role evidence, report/project/trace links, and the existing explicit work-order action.
- On mobile, command entry remains above the fold and Council composes as a bounded session list followed by the selected record. Touch targets remain at least 44px, translated text wraps within its region, and no sticky surface covers actions or evidence.
- Motion is limited to view entry, selection, disclosure, hover, press, and focus feedback. Depth comes from one selected rail, borders, and tonal contrast; decorative glow, oversized symbols, nested cards, and gradients are excluded.
- No carousel, modal, or drawer is introduced in this slice because decree modes, council evidence, actions, and source links are required operational content and must stay visible in normal document flow.

### Wave 2B Work Orders Layout Contract

- Work Orders uses a queue-and-detail workspace. The left rail owns counts, quick status filters, advanced filters, bulk selection, and record selection; the right pane owns the selected record and all lifecycle actions.
- The page never opens the full creation form merely because no record is selected. `Create Work Order` is an explicit header action; closing or selecting a queue item returns to the record workspace without mutating data.
- Quick status filters remain visible. Priority, agent, archive/legacy/test filters and source-id generation move into disclosures so records appear earlier without removing any capability.
- A selected record keeps status, context freshness, next safe action, and source-of-truth links above detailed fields. A compact section index links to Overview, Context and Safety, Agent and Handoff, Execution, and History without hiding audit evidence in tabs.
- Existing `?focus=` selection, editable source fields, bulk actions, context refresh/stale controls, external-agent assignment, handoff/prompt/report flows, automation jobs, patch review, archive confirmation, RBAC, and API behavior remain unchanged.
- Mobile composes as queue first and selected detail second. Controls keep 44px touch targets, translated labels wrap inside stable regions, and no sticky element covers actions or the last queue row.
- Motion is limited to selection, disclosure, focus, hover, and press feedback. Required decisions, context warnings, reports, patch evidence, and source links remain in document flow and never move into a carousel.

### Wave 2C Automation Jobs Layout Contract

- Automation Jobs uses an execution queue and focused review workspace. The left rail owns review priority, status filtering, runner availability, and job selection; the right pane owns execution evidence and every mutating action.
- Summary metrics form one compact status strip instead of four detached cards. Runner health remains visible near the queue, but host and heartbeat metadata stay secondary to jobs that require attention.
- `NEEDS_REVIEW`, active, failed, and historical jobs remain available through stable quick filters. Queue rows expose status, mode, context, project, runner, and a concise result summary without placing Approve or Cancel actions in the browsing rail.
- A selected job keeps status, mode, context freshness, work-order source, King recommendation, and the next safe action above logs or raw execution output. A compact section index links to Overview, Execution, Agent Review, Patch Review, and History.
- King approval remains explicit and detail-scoped. Approve execution, cancel, import patch, patch approve/reject/revision, branch push, and PR creation keep their current RBAC and lifecycle gates; the UI does not imply that review, branch push, merge, or deploy is automatic.
- Plans, logs, provenance JSON, command output, full diffs, snapshot ids, and low-level timing remain available through disclosures or bounded code surfaces. Failed validation summaries stay visible before raw stdout/stderr.
- Mobile composes as queue first and selected detail second. Metrics, quick filters, badges, runner metadata, and action groups wrap inside the viewport with 44px touch targets and no horizontal page scroll.
- Motion is limited to queue selection, disclosure, focus, hover, press, and status feedback. Required approvals, failures, provenance, patch evidence, and source links remain in normal document flow and never move into a carousel.

### Wave 2D Reports and Decree Lineage Layout Contract

- Reports becomes a restrained archive workspace: searchable/filterable document rail, selected report reading pane, and a compact provenance/action rail. Search and selection stay visible without surrounding every section in a separate card.
- Report editing remains an explicit secondary mode. Delete stays destructive and confirmation-gated; normal browsing must not expose mutation controls as the dominant visual action.
- Decree Lineage remains read-only and linkable. Recompose its seven stages into one consistent evidence timeline with compact stage geometry, bounded disclosures for long council/prompt/result content, and direct links back to owning Task, Council, Work Order, Automation Job/Patch, Review, Knowledge, and Report records where contracts already provide identifiers.
- Timeline motion may acknowledge newly available real stages but must not imply progress that the API did not return. Completed, missing, blocked, and review-required states must combine icon, text, and semantic color.
- Replace hardcoded page chrome on both routes with semantic English/Thai keys while preserving server-provided titles, commands, responses, summaries, identifiers, and raw enums as source data.
- Wide desktop may use master-detail composition; tablet and mobile must become list/timeline then reading detail with no horizontal page scroll. Required evidence and source links stay in document flow, not a carousel or modal.
- Existing report search/edit/delete behavior and Decree Lineage API behavior remain unchanged. This slice adds no backend contract, lifecycle, runner, autonomy, or approval changes.

| Route | Primary refinement |
| --- | --- |
| `/throne-room` | Make decree entry the first task, latest council result the second, and live Kingdom visualization supporting context. Keep advanced execution handoff actions in a clearly bounded result area. |
| `/council` | Use a master-detail archive: session list, selected council evidence, role responses, and source/report links. Avoid repeating the full latest-session presentation from Throne Room. |
| `/work-orders` | Split the large surface into queue, focused detail, context/safety, handoff, and execution summary tabs or panels. Keep WorkOrder status and next safe action permanently visible. |
| `/automation-jobs` | Use execution queue plus focused job detail. Separate runner steps, validation output, patch, and review into explicit tabs with a persistent approval boundary. |
| `/reports` | Convert to a restrained archive with search/filter toolbar, document list, and reading pane. Preserve Task/Council/trace provenance. |
| `/decree-lineage/:workOrderId` | Refine the read-only lifecycle evidence timeline, add source navigation and semantic English/Thai chrome, and keep long prompt/result evidence in bounded disclosures. |

### Wave 3: Projects and Strategy

Progress: **Waves 3A, 3B, and 3C complete; Wave 4A Agents Registry complete** - Projects owns context freshness, local documents, active work, repository evidence, artifacts, and export through a compact portfolio and bounded project workspace. Project Inbox, Artifacts, and Strategy now apply the same source-of-truth hierarchy to routing uncertainty, generated evidence, and strategic decisions.

### Wave 3A Projects Layout Contract

- `/projects` becomes a compact portfolio workspace. Each row must expose project status, priority, context freshness, active work, and the next safe project action without expanding into oversized cards.
- `/projects/:id` keeps the project as the owning source for routing, local document roots, snapshots, repository context, related work, artifacts, and export. Recompose the page around a stable project header, health/status strip, and bounded Overview, Work, Local Docs, Repository, Artifacts, and Export sections.
- Creation and edit remain explicit role-gated actions. Local-doc scan, context repair, root management, and export keep their existing API, RBAC, safe-path, and no-raw-root/no-secret boundaries.
- Use real context and scan state for status motion. Never animate a scan, repair, or repository refresh unless the API reports that operation as active.
- Mobile shows the portfolio before project detail and keeps every source/action control at least 44px. Thai labels, long project names, hashes, and repository metadata must wrap or own overflow without widening the page.
- No project-routing, Prisma, context-binding, local-doc safety, artifact ownership, or export contract changes are part of this slice.

Wave 3A implementation keeps route files thin and separates page orchestration, controller hooks, domain helpers, and presentation sections. `ProjectsPage.tsx` and `ProjectDetailPage.tsx` are below 70 lines, and every new project module is below 220 lines.

### Wave 3B Project Inbox and Artifacts Layout Contract

- Project Inbox uses a compact triage queue plus selected routing evidence. Confidence, deterministic reason, suggested project, source record, and assignment safety stay visible before secondary metadata.
- Artifacts uses an archive list plus selected evidence detail. Type, project, source ownership, provenance, duplicate state, and source navigation stay visible before long content.
- Existing deterministic routing, confidence thresholds, single/bulk assignment, artifact mutations, provenance, RBAC, and safe-path behavior remain unchanged.
- Mobile composes as queue/list first and selected evidence second. Required controls remain at least 44px, translated labels wrap, and long evidence owns overflow without widening the page.
- Motion is limited to real selection, filtering, disclosure, mutation feedback, hover, press, and focus state. Required routing decisions, confidence evidence, artifact provenance, and source links never move into a carousel.

Wave 3B implementation keeps both route files thin and splits API/state controllers, pure display models, filters, queue/archive lists, selected evidence detail, and mutation dialogs. `ProjectInboxPage.tsx` is 40 lines, `ArtifactsPage.tsx` is 27 lines, and every new Wave 3B module is below 150 lines. Project Inbox retains deterministic confidence and assignment behavior; Artifacts mirrors backend RBAC by separating create, edit, and delete permissions. Provenance shows field names without rendering arbitrary raw values or local paths.

### Wave 3C Strategy Layout Contract

- `/strategy` becomes a decision workspace with one compact strategic overview and clear Objectives, Opportunities, Assets, and Revenue views. The page must not show all creation forms at once.
- Creation and editing move into explicit dialogs or drawers, while source ownership, project links, confidence, and current status remain visible in normal document flow.
- Existing strategy intake, mutation, RBAC, source-link, and project ownership contracts remain unchanged. Long strategic prose and Thai labels must wrap without widening the viewport.

Wave 3C implementation replaces simultaneous forms with a compact overview, stable section navigation, filtered collection views, and explicit create/edit dialogs. `StrategyPage.tsx` is 16 lines, and every new controller, model, workspace, collection, dialog, and translation module is below 560 lines. Strategy records retain direct Project, Artifact/Report, Usage Trace, and Work Order ownership links.

| Route | Primary refinement |
| --- | --- |
| `/projects` | Use a compact project portfolio list with health, active work, context freshness, and one primary create action. Avoid oversized project cards. |
| `/projects/:id` | Add project header, health/status strip, and tabs for Overview, Work, Local Docs, Repository, Artifacts, and Export. Keep context ownership obvious. |
| `/project-inbox` | Use a triage table/list with confidence, reason, suggested project, and safe bulk actions. Make uncertain routing evidence easy to compare. |
| `/artifacts` | Use archive filters, type/source chips, compact rows, and a detail/preview pane. Clearly distinguish generic artifacts from reports and patch artifacts. |
| `/strategy` | Separate Overview, Objectives, Opportunities, Assets, and Revenue into tabs or sections. Move creation forms into focused dialogs/drawers instead of showing several forms at once. |

### Wave 4: Agents, Providers, and Models

Progress: **Wave 4A complete; Wave 4B External Agents next.** `/agents` now uses a compact registry plus selected detail, six stable evidence/configuration sections, explicit editor dialogs, semantic English/Thai chrome, and direct ownership links while preserving all routing-validation and profile-source contracts.

| Route | Primary refinement |
| --- | --- |
| `/agents` | Use agent list plus focused configuration detail. Group Identity, Prompt, Skills, Routing, Fallbacks, and Preview; keep validation feedback adjacent to the affected row. |
| `/external-agents` | Present registry rows with availability, capability, execution mode, and test status. Use a focused create/edit dialog. |
| `/agent-chat` | Create a stable three-pane desktop layout: sessions, conversation, context/source rail; collapse to one pane at a time on mobile. |
| `/living-agents` | Use a compact operational roster with filters, state, active assignment, and profile link. Avoid decorative repeated cards when a list scans better. |
| `/living-agents/:agentId` | Organize identity/health at top, then tabs for Timeline, Work, Relationships, Usage, and Knowledge. Keep long histories out of the header. |
| `/providers` | Use provider registry table/list with readiness, credentials reference state, model health, and focused configuration drawer. Do not expose secrets. |
| `/routing` | Visualize each fallback chain as an ordered vertical sequence with provider/model health and clear drag/reorder or step controls. Keep effective-source explanations visible. |
| `/treasury` | Build a financial dashboard hierarchy: spend/budget first, trend second, provider/model analysis third, reconciliation/admin tools last. Reduce competing panels. |
| `/usage-traces/:traceId` | Use an audit timeline with a compact attribution summary, token/cost metrics, provider attempts, and explicit links back to Task/Council/Report/Project. |

### Wave 5: Knowledge and Governance

| Route | Primary refinement |
| --- | --- |
| `/knowledge-lab` | Replace the landing-card page with a parent workspace and tabs for Candidates and Approved Knowledge. |
| `/knowledge-lab/candidates` | Use a review queue with evidence, confidence, source trace, approve/reject actions, and a focused detail pane. |
| `/knowledge-lab/memories` | Use a searchable compact knowledge library with source/agent filters and archive controls. |
| `/memory` | Clarify the page as Institutional Memory, with authoring/search on one side and a readable entry detail on the other. Visually distinguish it from reviewed agent knowledge. |
| `/charter` | Treat as a governed document: reading width, section navigation, last-updated metadata, and a distinct King-only edit mode. |
| `/vision` | Match Charter's document system while emphasizing priorities, horizon, and last-updated state. Do not invent a separate visual language. |

### Wave 6: Administration and Entry

| Route | Primary refinement |
| --- | --- |
| `/matters` | Use an intake/review queue with priority, category, project, next action, and focused detail. Keep Task/WorkOrder creation as explicit transitions. |
| `/notices` | Use a notification list with unread hierarchy, severity, source, timestamp, and compact read/archive tools. Avoid full cards per notice. |
| `/settings` | Group settings by domain with local navigation, descriptions, validation, save state, and links to owning provider/treasury pages. |
| `/users` | Use an account table with role, state, last activity, and a focused create-user dialog. Keep destructive actions secondary. |
| `/audit` | Improve scan density with a filter toolbar, stable table columns, metadata drawer, and clear timestamp/actor/resource hierarchy. |
| `/security` | Present session status, role/permissions, and operational health in three clear sections; keep sign-out as the only primary command. |
| `/profile` | Use a compact identity page with account metadata and direct links to Security and language preferences. |
| `/login` | Use a focused, centered authentication surface with visible AI Kingdom identity, restrained background, strong field states, and no marketing hero. |

## Implementation Order and Gates

Every wave follows the same sequence:

1. Confirm `main` is current and merge it into `codex/main` before editing.
2. Capture current desktop and mobile screenshots for the wave's pages.
3. Write a short per-wave layout contract before changing components.
4. Define the page's motion, depth, overlay, icon, and responsive behavior before implementation.
5. Implement shared primitives only as required by the first page.
6. Refine one page at a time and preserve existing behavior and source links.
7. Add or update focused interaction tests.
8. Verify English and Thai across the required viewports, keyboard focus, reduced motion, and 200% zoom.
9. Run web typecheck, tests, and build.
10. Commit on `codex/main`, fast-forward merge into local `main`, then return to `codex/main`.

## Acceptance Criteria

- All 39 routes use the same shell, spacing rhythm, typography roles, surface hierarchy, and state patterns.
- Desktop layouts are symmetric and aligned without forcing unrelated panels to equal visual weight.
- Mobile navigation does not require scrolling through every route horizontally.
- No nested decorative cards, oversized tool headings, gradient-orb decoration, or one-color page hierarchy.
- Cards and panels use 8px or smaller radii unless a compact status pill requires a full radius.
- Thai and English labels fit controls, tabs, badges, tables, and mobile layouts without overlap or clipping.
- Dashboard and other summary surfaces remain read-only and link to their owning source records.
- WorkOrder, AutomationJob, provider, project-context, and approval behavior remains unchanged.
- Keyboard focus, semantic headings, contrast, reduced motion, loading, empty, and error states are verified.
- Motion communicates state without replaying on routine refreshes, and all essential behavior remains usable with reduced motion enabled.
- Drawers, dialogs, popovers, sticky regions, and toasts follow one z-index scale and do not obscure controls or page content.
- Carousels never contain required decisions, queue items, reports, audit evidence, or the only route to source-of-truth records.
- Icon-only controls have accessible names and tooltips; mobile touch targets are at least 44px.
- Focused tests pass, followed by `npm run typecheck`, `npm run test --workspace @ai-kingdom/web`, and `npm run build --workspace @ai-kingdom/web`.

## Deferred Decisions

- Route renames, redirects, and permanent route removal.
- Backend response reshaping solely for presentation convenience.
- Combining Institutional Memory with Agent Knowledge storage.
- Combining provider configuration, routing, and Treasury APIs.
- New automation capability or any change to approval, patch, branch, PR, merge, or deploy gates.
