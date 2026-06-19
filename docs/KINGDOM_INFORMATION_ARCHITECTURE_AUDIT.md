# Kingdom Information Architecture Audit

Date: 2026-06-19

Scope: current `apps/web` route surface, information architecture, duplicated command surfaces, source-of-truth usage, and i18n readiness before further Mission Control work.

This is an audit only. It does not redesign the UI, delete pages, rename routes, or change app behavior.

## Executive Summary

The web app currently exposes 37 authenticated routes plus `/login` and the wildcard redirect to `/dashboard`. The current navigation is grouped by broad purpose, but several pages now function as partial command centers over the same operational data:

- `/dashboard`, `/inbox`, `/kingdom/operations`, `/royal-brief`, and `/living-loop` all summarize operational state.
- `/throne-room`, `/council`, `/work-orders`, `/automation-jobs`, and `/reports` all show parts of the same decree-to-execution lifecycle.
- `/providers`, `/routing`, `/treasury`, `/agents`, and `/settings` all influence provider/model behavior.
- `/memory`, `/knowledge-lab/candidates`, `/knowledge-lab/memories`, `/reports`, and `/artifacts` all store or surface learnable/archive material.

The cleanest model is to keep Mission Control as a read-only command center that links to owning records. It should not become a duplicate data store or edit surface. Durable ownership should remain:

- Task: high-level intent or royal decree.
- CouncilSession and AgentResponse: agent reasoning and advice.
- WorkOrder: executable work package and manual handoff state.
- AutomationJob: actual runner or external execution.
- PatchArtifact and runner reports: execution output evidence.
- AgentReviewSummary: evaluation of execution result.
- AgentKnowledgeCandidate and AgentKnowledgeMemory: learnable memory workflow.
- Provider, RouteChain, ModelPricing, UsageRecord, and treasury snapshots: provider/model/cost source of truth.
- RoyalBrief, NextActionQueue, MissionControl, and Kingdom health/activity: generated summaries only.

## Route Map

Routes are defined in `apps/web/src/main.tsx`; nav labels and role visibility are defined in `apps/web/src/components/layout/AppLayout.tsx`.

| Route | Component file | Current nav group | Title or page name | Page type |
| --- | --- | --- | --- | --- |
| `/login` | `apps/web/src/pages/LoginPage.tsx` | outside app shell | Login | action page |
| `/dashboard` | `apps/web/src/pages/DashboardPage.tsx` | Kingdom | The Kingdom at a Glance / Mission Control | dashboard |
| `/throne-room` | `apps/web/src/pages/ThroneRoomPage.tsx` | Kingdom | Live Kingdom / Issue a royal decree | action page |
| `/kingdom/operations` | `apps/web/src/pages/KingdomOperationsPage.tsx` | Kingdom | Kingdom Operations | dashboard |
| `/strategy` | `apps/web/src/pages/StrategyPage.tsx` | Kingdom | Strategy Ledger | action/config page |
| `/inbox` | `apps/web/src/pages/InboxPage.tsx` | Kingdom | What should the King do next? | review dashboard |
| `/projects` | `apps/web/src/pages/ProjectsPage.tsx` | Work | Projects | action/config page |
| `/projects/:id` | `apps/web/src/pages/ProjectDetailPage.tsx` | Work | Project workspace | detail/action page |
| `/work-orders` | `apps/web/src/pages/WorkOrdersPage.tsx` | Work | Work Orders | action/review page |
| `/project-inbox` | `apps/web/src/pages/ProjectInboxPage.tsx` | Work | Project Inbox | review/action page |
| `/artifacts` | `apps/web/src/pages/ArtifactsPage.tsx` | Work | Artifacts | archive/action page |
| `/reports` | `apps/web/src/pages/ReportsPage.tsx` | Work | Royal Reports | archive/action page |
| `/memory` | `apps/web/src/pages/MemoryPage.tsx` | Knowledge | Institutional memory | archive/action page |
| `/council` | `apps/web/src/pages/CouncilPage.tsx` | Knowledge | Council Records | review/action page |
| `/agent-chat` | `apps/web/src/pages/AgentChatPage.tsx` | Knowledge | Agent Chat | action page |
| `/knowledge-lab` | `apps/web/src/pages/KnowledgeLabPage.tsx` | Knowledge | Knowledge Lab | index page |
| `/knowledge-lab/candidates` | `apps/web/src/pages/KnowledgeCandidatesPage.tsx` | Knowledge | Knowledge Candidates | review/action page |
| `/knowledge-lab/memories` | `apps/web/src/pages/KnowledgeMemoriesPage.tsx` | Knowledge | Knowledge Memories | archive/review page |
| `/charter` | `apps/web/src/pages/CharterPage.tsx` | Knowledge | Kingdom Charter | config/reference page |
| `/vision` | `apps/web/src/pages/VisionPage.tsx` | Knowledge | Kingdom Vision | config/reference page |
| `/living-agents` | `apps/web/src/pages/LivingAgentsPage.tsx` | Knowledge | Living Agents | dashboard/list page |
| `/living-agents/:agentId` | `apps/web/src/pages/LivingAgentProfilePage.tsx` | detail route | Living Agent profile | detail dashboard |
| `/agents` | `apps/web/src/pages/AgentsPage.tsx` | Agents | Agents | config page |
| `/external-agents` | `apps/web/src/pages/ExternalAgentsPage.tsx` | Agents | External app agents | config page |
| `/providers` | `apps/web/src/pages/ProvidersPage.tsx` | Agents | AI providers | config page |
| `/routing` | `apps/web/src/pages/RoutingPage.tsx` | Agents | Routing | config page |
| `/automation-jobs` | `apps/web/src/pages/AutomationJobsPage.tsx` | System | Automation Jobs | execution/review page |
| `/living-loop` | `apps/web/src/pages/LivingLoopPage.tsx` | System | Living Loop | automation review page |
| `/treasury` | `apps/web/src/pages/TreasuryPage.tsx` | System | Treasury | dashboard/config page |
| `/audit` | `apps/web/src/pages/AuditPage.tsx` | System | Audit Log | read-only review page |
| `/settings` | `apps/web/src/pages/SettingsPage.tsx` | System | Kingdom configuration | config page |
| `/users` | `apps/web/src/pages/UsersPage.tsx` | System | Royal account management | config page |
| `/notices` | `apps/web/src/pages/NoticesPage.tsx` | System | Royal Notices | action/review page |
| `/matters` | `apps/web/src/pages/MattersPage.tsx` | System | Matters of the Realm | action/review page |
| `/security` | `apps/web/src/pages/SecurityPage.tsx` | System | Session and permissions | read-only page |
| `/profile` | `apps/web/src/pages/ProfilePage.tsx` | System | Royal identity | read-only page |
| `/usage-traces/:traceId` | `apps/web/src/pages/UsageTracePage.tsx` | detail route | Usage Trace | detail/audit page |
| `*` | `Navigate to="/dashboard"` | outside app shell | fallback redirect | redirect |

## Page Inventory

| Route | Responsibility | Primary data and APIs | Important entities shown | User actions | Ownership risk |
| --- | --- | --- | --- | --- | --- |
| `/login` | Authenticate and start session. | `/auth/login`; auth store. | User session. | Log in. | No overlap. |
| `/dashboard` | High-level command surface for next actions, mission state, health, active initiatives, reports, and activity. | `getMissionControl`, `getNextActions`, `getKingdomHealth`, `getKingdomActivity`, `secretaryBrief`, `workOrders`, `projects`, `livingLoopStatus`. | MissionControl, NextActionQueue, WorkOrder, Project, SecretaryBrief, KingdomHealth. | Run living loop once, navigate to sources. | Must remain summary-only; high duplication with Inbox, Royal Brief, Operations, Living Loop. |
| `/throne-room` | Live Kingdom view plus command terminal for royal decrees and latest council output. | Zustand `tasks`, `settings`; `createTask` through store; `createCouncilHandoff`, `planCouncilWorkOrder`, `executeCouncilWithExternalAgent`. | Task, CouncilSession, AgentResponse, WorkOrder, HandoffBrief, AutomationJob. | Issue decree, create work order, create handoff, schedule external execution. | Mixes creation, live status, and council detail; should be parent entry point, not the full archive. |
| `/council` | Browse historical council sessions and role outputs. | Zustand `councilSessions`, `reports`; `planCouncilWorkOrder`. | CouncilSession, AgentResponse, Report, Task. | Select session, create work order from completed session, open report/trace. | Overlaps with Throne Room latest-session panel and Reports. |
| `/agents` | Configure internal agents, prompts, fallback model readiness, display profile, avatars, routing preview. | Zustand `agents`, `providers`; `agents`, `getProviderModels`, `validateProviderModels`, `getAgentRoutingPreview`, `getAgentEffectiveRequestPreview`, display profile/avatar APIs. | Agent, provider/model settings. | Create/update/deactivate agent, validate models, update display profile/avatar. | Overlaps with Providers/Routing because agent-level config affects model routing. |
| `/agent-chat` | Direct single-agent conversations with project context and source links. | `getDirectAgentOptions`, `getDirectAgentSessions`, `getDirectAgentSession`, `createDirectAgentSession`, `sendDirectAgentMessage`, `projects`. | DirectAgentSession, Agent, Project, UsageTrace, Artifact, KnowledgeCandidate. | Start chat, send message, open source artifacts/traces. | Could be a tool tab under Agents or Knowledge; it is not a system source of truth. |
| `/external-agents` | Manage external/manual agent registry. | `externalAgents`, `createExternalAgent`, `updateExternalAgent`, `testExternalAgent`. | ExternalAgent. | Create/update/test/activate external agent. | Source for handoff targets; Work Orders should link here for registry details. |
| `/work-orders` | Primary executable work queue and work detail surface. | `workOrders`, `projects`, `externalAgents`, `automationJobs`, `patchArtifacts`, work-order context/recommendation/handoff/report/job APIs. | WorkOrder, HandoffBrief, ImplementationReport, AutomationJob, PatchArtifact, ProjectContextBinding, ExternalAgent. | Create/update/archive/delete work order, refresh/stale context, assign/dispatch external agent, build prompt, submit report, create/approve automation job, review patches. | Very broad; should remain source of truth for executable work but push job execution details to Automation Jobs detail tabs. |
| `/projects` | Project list, project creation/editing, shortcuts, local docs health. | `projects`, `createProject`, `updateProject`, `projectWorkOrders`, `getProjectContextHealth`, `getProjectLocalDocs`, `scanProjectLocalDocumentRoot`, `rebindProjectContexts`. | Project, WorkOrder, LocalDocumentRoot, ProjectContextHealth. | Create/update project, scan local docs, rebind contexts, navigate to related sources. | Correct owner for project metadata; should not duplicate full work-order/project-detail views. |
| `/projects/:id` | Project workspace with linked work, repository scan, local docs, context health, Obsidian export. | `projectOverview`, project linked rows, repository/local-doc APIs, context health/rebind/reconcile APIs. | Project, Task, Matter, WorkOrder, Report, Memory, Artifact, RepositorySnapshot, LocalDocumentSnapshot, ProjectContextBinding. | Scan repository/local docs, add roots, read approved files, rebind contexts, export Obsidian. | Heavy detail page; should be source for project context, not Mission Control. |
| `/project-inbox` | Review low-confidence project routing candidates. | `projectInbox`, `projects`, assign/dismiss/archive APIs. | ProjectInboxItem, Project. | Assign/dismiss/archive/bulk archive low-confidence items. | Correct review queue; should feed Mission Control only as a count/action. |
| `/artifacts` | Archive and creation surface for durable artifacts and source evidence. | `artifacts`, `createArtifact`, `updateArtifact`, `archiveDuplicateArtifact`, `projects`. | Artifact, Project, UsageTrace source link. | Create/update/archive duplicate artifact, open source/trace. | Overlaps with reports, handoff briefs, patch artifacts; needs clearer type ownership. |
| `/reports` | Browse/edit/delete Royal Reports from council decisions. | Zustand `reports`; `searchReports`, `updateReport`, `deleteReport`. | Report, Task, CouncilSession, AgentResponse. | Search/filter/edit/delete report. | Overlaps with Council archive; should be final-counsel archive, not execution results. |
| `/memory` | Manage institutional memory used by council. | Zustand `memories`; `searchMemories`, `createMemory`, `updateMemory`, `deleteMemory`. | Memory. | Search/create/update/delete memory. | Overlaps with Knowledge Memories; needs clearer legacy/manual vs reviewed memory split. |
| `/users` | King-only account management. | `users`, `createUser`, `deleteUser`. | User. | Create/delete/deactivate users. | No IA conflict. |
| `/settings` | Key-value system settings and AI defaults. | Zustand `settings`, `providers`; `updateSetting`. | Setting, Provider. | Update settings. | Overlaps with Providers, Routing, Treasury for model/budget-related controls. |
| `/providers` | AI provider registry and model validation status. | Zustand `providers`; `validateModels`, provider telemetry/model/account health APIs. | AIProvider, ProviderModelSnapshot, ProviderAccountSnapshot, ProviderHealthSnapshot, ModelPricing. | Create/update/delete provider, validate models. | Correct source for provider config; telemetry should link to Treasury. |
| `/routing` | Configure provider/model fallback chains. | `routeChains`, `createRouteChain`, `updateRouteChain`, `deleteRouteChain`, `duplicateRouteChain`, `providerModels`, `treasuryProviderRegistry`. | RouteChain, AIProvider, ProviderModelSnapshot. | Create/edit/duplicate/delete route chains. | Correct source for routing config; should link from Agents and Providers. |
| `/treasury` | Cost, usage, provider balances, pricing, fallback analytics, reconciliation. | Treasury, provider balance, model sync, model pricing, reconciliation APIs. | UsageRecord, AIUsageTrace, ProviderBalanceSnapshot, ModelPricing, ProviderRegistry, BudgetStatus. | Sync balances/models, compute health, run reconciliation, CRUD model pricing. | Correct source for cost/usage; providers page should not duplicate pricing controls deeply. |
| `/usage-traces/:traceId` | Detailed trace audit for model calls and attribution links. | `usageTrace`. | UsageTrace, Task, CouncilSession, Report, Project, Agent, provider/model. | Read trace and follow entity links. | Correct detail route; source links from all AI/cost surfaces should point here. |
| `/living-agents` | Agent presence/summary dashboard. | Living agents APIs via page components. | LivingAgentSummary, AgentActivity. | Filter/select agents, navigate to profile. | Overlaps with Operations and Throne Room live view. |
| `/living-agents/:agentId` | Full agent profile, timeline, relations, usage, traces, reports, memory, provider data, audit logs. | Living agent profile/timeline/relations APIs plus agent knowledge APIs. | Agent, AgentActivity, UsageTrace, CouncilSession, Report, Memory, Project, Provider, KnowledgeCandidate, KnowledgeMemory. | Filter timeline, open related records. | Strong detail route; should be linked from Agents/Operations, not repeated in full elsewhere. |
| `/knowledge-lab` | Landing/index for knowledge review pages. | No API. | KnowledgeCandidate, KnowledgeMemory link cards. | Navigate to candidates or memories. | Can become parent tab container. |
| `/knowledge-lab/candidates` | Review candidate memories. | `knowledgeCandidates`, `approveCandidate`, `rejectCandidate`. | AgentKnowledgeCandidate, UsageTrace, Agent. | Approve/reject candidate, filter. | Correct review owner for learnable memory. |
| `/knowledge-lab/memories` | Browse approved knowledge memories. | `knowledgeMemories`, `archiveKnowledgeMemory`. | AgentKnowledgeMemory, UsageTrace, Agent. | Archive memory, filter. | Overlaps with `/memory`; define this as reviewed agent memory. |
| `/audit` | Security/admin audit log. | `auditLogs`, `auditSearch`. | AuditLog. | Search/filter audit logs. | No IA conflict. |
| `/charter` | Kingdom charter reference/edit page. | `charter`, `updateCharter`. | KingdomCharter. | King edit. | Config/reference. |
| `/vision` | Kingdom vision reference/edit page. | `vision`, `updateVision`. | KingdomVision. | King edit. | Config/reference. |
| `/notices` | Royal Secretary notices. | `notices`, `createNotice`, `updateNotice`. | Notice. | Create notice, mark read, archive. | Overlaps with Inbox if notices become action items; Inbox should link here. |
| `/matters` | Secretary matters and issue intake. | `matters`, `projects`, `createMatter`, `updateMatter`, `createTask`, `workOrderFromMatter`. | Matter, Task, WorkOrder, Project. | Create/update matters, create task, create work order. | Important upstream intake; route should be grouped near Tasks/Councils or Inbox, not buried in System. |
| `/profile` | Current account identity. | Auth store. | User. | Read-only. | No IA conflict. |
| `/security` | Session and permissions overview. | Auth store. | User/session. | Logout/session review. | No IA conflict. |
| `/automation-jobs` | Runner/external execution queue and patch/review detail. | `automationJobs`, `automationJob`, `runners`, `patchArtifacts`, `automationJobAgentReview`, approve/cancel/import/review/push/PR APIs. | AutomationJob, AgentRunner, PatchArtifact, AgentReviewSummary, ExternalAgentRun. | Approve/cancel job, import patch, regenerate review, approve/reject/request revision, push branch, create PR. | Correct owner for execution status and patch review; Work Orders should summarize and link. |
| `/living-loop` | Automation candidate queue, scheduler status, auto-validation settings, run history. | `livingLoopStatus`, `livingLoopRuns`, `automationCandidates`, `settings`, `updateSetting`, candidate approve/reject/archive/apply APIs. | LivingLoopRun, AutomationCandidate, Setting, AutomationJob candidates. | Run loop once, approve/reject/archive/apply candidates, update settings. | Overlaps with Dashboard/Royal Brief/Automation Jobs; should be automation governance detail. |
| `/royal-brief` | Generated daily summary of activity, blockers, decisions, context health, patch queue, provider status, provenance. | `latestRoyalBrief`, `generateRoyalBrief`, `rebindWorkOrderContext`, `reconcileContextWarnings`. | RoyalBrief, WorkOrder context, PatchArtifact, Provider/Treasury status, LivingLoop status. | Generate brief, rebind contexts, reconcile warnings. | Generated summary; must link back to source pages and avoid direct ownership. |
| `/inbox` | Live next-action queue across source pages. | `getNextActions`, `refreshWorkOrderContext`. | NextActionItem, WorkOrder context, AutomationJob, Council output, reports. | Filter, refresh context for action, navigate to source. | Very close to Mission Control; likely should be a Mission Control tab or the primary action queue. |
| `/kingdom/operations` | Real-time presence, current operations, activity stream, system health. | `getKingdomPresence`, `getKingdomActivity`, `getKingdomHealth`. | KingdomPresence, AgentPresence, KingdomActivity, KingdomHealth. | Navigate to Work Orders/Automation Jobs. | Overlaps with Dashboard and Living Agents; should become an operations tab/card set. |
| `/strategy` | Strategy objectives, opportunities, assets, revenue streams, research intake. | Strategy overview/objective/asset/revenue/opportunity APIs, `artifacts({ type: "MARKET_RESEARCH" })`. | KingdomObjective, KingdomOpportunity, KingdomAsset, RevenueStream, Artifact, WorkOrder. | Create/update strategy records, create opportunity from artifact, create work order. | Separate domain area; can stay separate from execution IA. |

## Entity and Source-of-Truth Map

| Entity | Source-of-truth API/service | Displayed on | Mutated on | Duplicated or unclear areas | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Agent | `/api/agents`, `apps/api/src/routes/agents.ts`, agent config in Prisma `Agent` | Agents, Living Agents, Living Agent profile, Council, Treasury, Agent Chat, Operations | Agents | Agent status/profile shown separately from configuration. | Keep `/agents` as config owner; Living Agent profile is operational detail. Link both ways. |
| Task | `/api/tasks`, `grandVizierOrchestrator`, Prisma `Task` | Throne Room, Council, Reports, Project Detail, Usage Trace, Matters-derived flows | Throne Room, Matters | No dedicated Tasks list route; Task is partially hidden inside Throne Room/Council. | Introduce "Tasks & Councils" parent later, with Task detail or tabbed task/council view. |
| CouncilSession | `/api/council`, `/api/tasks/:id/council`, Prisma `CouncilSession` | Throne Room latest, Council, Reports, Living Agent profile, Usage Trace | Throne Room, Council create-work-order action | Latest session and archive repeat role outputs. | Keep Council as archive/detail; Throne Room shows latest and links to Council detail. |
| AgentResponse | `CouncilSession.responses`, Prisma `AgentResponse` | Throne Room, Council, Reports, Living Agent profile | Created by orchestration only | Role outputs repeated across pages. | Treat as council detail evidence; summaries elsewhere link to Council/trace. |
| WorkOrder | `/api/work-orders`, `externalAgentWorkOrderService`, lifecycle/context services, Prisma `WorkOrder` | Work Orders, Dashboard, Inbox, Project detail, Royal Brief, Operations, Strategy, Matters | Work Orders, Council/Throne Room create actions, Matters, Strategy | Many summaries show status without deep links or context state. | Work Orders remains executable work source of truth. Every summary card links to `/work-orders?focus=<id>` when possible. |
| HandoffBrief | `/api/handoff-briefs`, `/api/work-orders/:id/handoff`, Prisma `HandoffBrief` | Work Orders, Artifacts-like summaries | Work Orders, Throne Room | Handoff can look like artifact/report. | Keep as Work Order evidence; optionally render as artifact reference but do not duplicate ownership. |
| AutomationJob | `/api/automation-jobs`, `/api/runner/jobs/*`, `automationJobService`, Prisma `AutomationJob` | Automation Jobs, Work Orders, Dashboard, Royal Brief, Living Loop | Automation Jobs, Work Orders, Living Loop via candidates | Execution status shown in multiple places. | Automation Jobs owns execution. Work Orders shows latest job summary and link. |
| AgentReviewSummary | `/api/automation-jobs/:id/agent-review`, `runnerResultReviewService`, Prisma `AgentReviewSummary` | Automation Jobs, Dashboard/Royal Brief summaries | Automation Jobs regenerate action after reports | Can blur with patch validation and implementation report. | Review belongs to AutomationJob result evaluation. Link from Work Order history. |
| AgentKnowledgeCandidate | `/api/knowledge-candidates`, `agentKnowledgeService`, Prisma `AgentKnowledgeCandidate` | Knowledge Candidates, Living Agent profile, Agent Chat source links | Knowledge Candidates | Overlaps with Memory page. | Candidate review stays in Knowledge Lab. Approved memories can link to legacy Memory if merged later. |
| Provider | `/api/providers`, `aiProviderRegistry`, provider routing/services, Prisma `AIProvider` | Providers, Agents, Routing, Treasury, Dashboard/Royal Brief issue cards | Providers | Provider health, pricing, balances split across Providers/Treasury. | Providers owns registry/config; Treasury owns cost/health telemetry; Routing owns fallback chains. |
| Model/provider routing config | `/api/route-chains`, `/api/agents/:id/routing-preview`, `aiProviderRouter`, `routeChainService` | Routing, Agents, Providers, Treasury | Routing, Agents fallback settings, Providers default model | Multiple pages can affect final model selection. | Add "effective model source" chips to Agents/Providers/Routing surfaces. Keep `/routing` as chain owner. |
| Cost/usage/budget | `/api/treasury`, `/api/provider-balances`, `treasuryService`, `aiUsageTraceService`, `budgetGuardService`, `modelPricingService` | Treasury, Usage Trace, Dashboard/Royal Brief provider issue summaries | Treasury, Settings for budget limits | Budget settings live in Settings; pricing in Treasury; provider health in Providers/Treasury. | Treasury owns usage/cost. Settings should link to Treasury budget view. |
| RoyalBrief/decisionsNeeded | `/api/royal-brief`, `royalBriefService` | Royal Brief, Dashboard-like summary surfaces | Royal Brief generate/archive | It is a generated digest and can become stale. | Treat as historical daily digest, not live state. Each decision needs routeTo/sourceLink. |
| Local docs/context binding | `/api/projects/:id/local-docs`, `/api/projects/:id/context-health`, `/api/work-orders/:id/context`, `localDocumentAccessService`, `projectContextBindingService` | Project detail, Projects, Work Orders, Royal Brief, Inbox | Project detail, Projects, Work Orders, Royal Brief/Inbox refresh actions | Context state is scattered and safety-critical. | Project detail owns local docs roots/snapshots. WorkOrder context owns patch safety gating. Summaries show FRESH/STALE/MISSING only with links. |
| Artifacts/patches/runner results | `/api/artifacts`, `/api/patch-artifacts`, `/api/runner/jobs/*`, `patchArtifactService` | Artifacts, Automation Jobs, Work Orders, Project detail, Usage Trace | Artifacts, Automation Jobs, Runner API, Work Orders patch review | Generic Artifacts and PatchArtifacts are distinct but visually similar. | PatchArtifact belongs under execution/job result. Generic Artifact remains project/archive knowledge. |

## Overlap and Duplication Findings

| Overlap | Current problem | Recommendation |
| --- | --- | --- |
| Dashboard vs Inbox vs Royal Brief vs Kingdom Operations | Four surfaces answer "what is happening" and "what needs attention" with different freshness models. | Make Mission Control/Dashboard the command center. Convert Inbox into the primary "Action Queue" tab/card. Keep Royal Brief as dated generated digest. Convert Operations into a real-time tab/card set under Mission Control. |
| Throne Room vs Council vs Reports | Latest council, historical council, final report, and work-order creation are spread across three pages. | Keep Throne Room as decree entry and latest-result handoff. Make Tasks & Councils the parent for Task/Council detail. Reports remain final archived counsel with source links. |
| Work Orders vs Automation Jobs vs Runner/Patch Review | Work Orders contains job creation, job list, runner status, patch review, reports, and handoff. Automation Jobs also owns the same execution and patch details. | Work Orders owns executable intent and next safe action. Automation Jobs owns execution detail, runner status, patch artifacts, and result review. Work Orders should show a compact "latest execution" panel linking to job detail. |
| Providers vs Routing vs Agents model settings vs Treasury | Effective provider/model choice is assembled from provider registry, route chains, agent fallback config, model validation, pricing, and budget. | Use Providers & Models nav group with tabs: Providers, Routing Chains, Model Pricing/Telemetry, Agent Effective Request. Keep writes on existing routes initially, but cross-link effective source. |
| Knowledge Candidates vs Knowledge Memories vs Memory | Reviewed agent knowledge and manual institutional memory are separate systems with similar labels. | Keep Knowledge Lab for candidate review and approved agent memories. Rename legacy Memory later to "Institutional Memory" or merge as a tab if backend contracts converge. |
| Artifacts vs Reports vs Handoff Briefs vs Patch Artifacts | Several durable documents look like archive objects but have different lifecycle owners. | Generic Artifacts = project/archive knowledge. Reports = final council counsel. HandoffBrief = WorkOrder evidence. PatchArtifact = AutomationJob execution output. Summary pages should label the owner. |
| Living Agents vs Operations vs Throne Room live view | Agent presence/activity appears in three visual contexts. | Keep Living Agents as agent detail/relationship explorer. Use Operations/Mission Control for current presence summary. Throne Room live view can be visual entry, but link to Living Agent profiles. |
| Matters/Notices vs Inbox | Secretary signals and next actions can both represent attention queues. | Inbox should aggregate and link to Matters/Notices, not replace them. Matters are intake records; Notices are alerts. |

## Recommended Navigation Structure

This structure can be introduced gradually without renaming routes first. Start by changing labels/grouping and adding redirects only after users have adjusted.

| Proposed nav item | What belongs there | What should not belong there | Existing routes/components | Future shape |
| --- | --- | --- | --- | --- |
| Mission Control | Live top action, action queue, health, operations, active work, source links. | Editing durable records; generated brief history as source of truth. | `/dashboard`, `/inbox`, `/kingdom/operations`, summary parts of `/royal-brief`, summary parts of `/living-loop`. | Dashboard with tabs/cards: Overview, Action Queue, Operations, Health. |
| Tasks & Councils | Task/decree creation, Task detail, CouncilSession detail, AgentResponse evidence, final counsel links. | Work execution detail after handoff. | `/throne-room`, `/council`, parts of `/reports`, usage trace links. | Parent route with `Issue Decree`, `Tasks`, `Council Sessions` tabs. |
| Work Orders | Executable work package, context binding status, handoff prompt, assigned external agent, next safe action. | Runner log/patch review detail except summary. | `/work-orders`, WorkOrder panels in `/projects/:id`, `/matters`, `/strategy`. | Work order list + focused detail route or tabbed detail. |
| Execution | Runner jobs, automation jobs, external agent runs, patch artifacts, validation output, agent review summaries. | Work-order authoring or provider configuration. | `/automation-jobs`, runner status from `/royal-brief`, patch review sections in `/work-orders`. | `Execution / Automation Jobs` with job detail route. |
| Agents | Internal agents, external handoff agents, agent chat, living agent profiles. | Provider/model routing internals except linked previews. | `/agents`, `/external-agents`, `/agent-chat`, `/living-agents`, `/living-agents/:agentId`. | Tabs: Internal, External, Chat, Activity. |
| Providers & Models | Provider registry, route chains, model validation, pricing, usage, budget warnings. | Agent prompt/persona configuration. | `/providers`, `/routing`, `/treasury`, model-pricing sections, settings budget keys. | Tabs: Providers, Routing, Pricing, Usage, Budget. |
| Reviews & Knowledge | Knowledge candidates, approved knowledge memories, institutional memory, reports. | Execution patch approval details. | `/knowledge-lab`, `/knowledge-lab/candidates`, `/knowledge-lab/memories`, `/memory`, `/reports`. | Tabs: Review Queue, Approved Knowledge, Institutional Memory, Reports. |
| Projects & Artifacts | Projects, project detail, project inbox, local docs, repository scans, generic artifacts. | Work execution queues. | `/projects`, `/projects/:id`, `/project-inbox`, `/artifacts`. | Keep as separate top-level group or "Workspace". |
| Strategy | Objectives, opportunities, assets, revenue streams, experiments. | Operational command queues. | `/strategy`. | Keep separate domain workspace. |
| Administration | Users, audit log, settings, profile, security, charter, vision, notices/matters if kept administrative. | Daily operational action queue. | `/users`, `/audit`, `/settings`, `/profile`, `/security`, `/charter`, `/vision`, `/notices`, `/matters`. | Split "Governance" from "Admin" later if menu stays crowded. |

## Source-of-Truth Ownership Model

Use this ownership chain for future Mission Control work:

1. Mission Control displays a live view derived from `/api/mission-control`, `/api/next-actions`, and `/api/kingdom/*`.
2. A summary card must include a source entity type, source id, source route, freshness timestamp, and recommended action route.
3. Mission Control can trigger safe aggregator actions only when the owning route already supports them, such as refreshing work-order context. It should not create new lifecycle semantics.
4. Task owns intent; CouncilSession owns advice; WorkOrder owns executable scope; AutomationJob owns execution; AgentReviewSummary owns evaluation; AgentKnowledgeCandidate owns learning review.
5. Provider configuration remains in Providers/Routing; usage and budget remain in Treasury.
6. Royal Brief remains a dated generated artifact. It can summarize decisions but should not be the canonical queue.
7. Local docs and context binding remain project/work-order scoped. Never expose raw root paths or secrets in summaries.

## Risky Areas

- WorkOrdersPage has become a large multi-owner page. It is the highest-risk page for accidental lifecycle changes.
- Dashboard, Inbox, Operations, Royal Brief, and Living Loop can confuse freshness: live queue, generated brief, scheduler status, and health snapshots are not the same thing.
- Context binding is safety-critical but visible in many places. Any Mission Control card that mentions patch safety must show `FRESH`, `STALE`, `MISSING`, or `PARTIAL` and link to the owning WorkOrder or Project.
- Provider/model troubleshooting requires crossing Agents, Providers, Routing, Treasury, and Settings. The app needs explicit "effective source" links before this is easy to debug.
- Several pages show raw enum values directly. This is manageable in English, but it will block polished Thai/English i18n.
- Wide fixed grids and compact uppercase badges are common. Thai labels will be longer and may clip in sidebar pills, status badges, tables, and cards.

## UI Simplification Recommendations

- Put "Top recommended action" at the top of Mission Control, backed by `/api/next-actions`, with source chips and a single primary route.
- Standardize source chips: entity type, short id/title, owning page, freshness timestamp, and generated-by label where applicable.
- Add status timelines to Task -> Council -> WorkOrder -> AutomationJob -> Review detail flows.
- Add "Why am I seeing this?" provenance text on summary cards sourced from next-action `why`, Royal Brief provenance, or activity stream source references.
- Use consistent action verbs: Review, Refresh context, Open source, Create work order, Approve job, Request revision.
- Keep empty/loading/error states consistent by reusing `EmptyState`, `LoadingState`, and `ErrorState` in older pages that still render ad hoc text.
- Add focused links from Project, WorkOrder, AutomationJob, Usage Trace, and Treasury records to each other instead of repeating full data panels.
- Avoid showing enum strings directly to users unless the enum itself is the audit record. Display translated labels but retain raw enum in tooltips or details.
- Ensure all compact labels wrap or truncate safely. Thai text will need more horizontal space than uppercase English chips.

## i18n Readiness Audit

No full i18n helper is currently wired through the frontend. The audit found extensive hardcoded English text in page headers, buttons, empty states, status labels, descriptions, form labels, and enum options.

High-priority areas for translation keys:

- Nav category names and labels in `AppLayout.tsx`.
- Page headers and section titles across `DashboardPage`, `InboxPage`, `WorkOrdersPage`, `AutomationJobsPage`, `RoyalBriefPage`, `AgentsPage`, `ProvidersPage`, `RoutingPage`, and `TreasuryPage`.
- Common actions: Open source, Review, Create, Save, Delete, Archive, Refresh, Approve, Reject, Request revision, Run Once.
- Status labels and enum labels for WorkOrder, AutomationJob, PatchArtifact, context binding, provider health, route chain status, knowledge candidate status, and priority/risk.
- Empty/loading/error strings in reusable UI components and page-specific fallbacks.
- Validation output labels: stdout, stderr, exit code, duration, timed out, command.
- Source/provenance labels in `ProvenanceLinks.tsx`, Dashboard cards, Inbox cards, WorkOrder source links, and Royal Brief provenance.

Components likely to need Thai-length testing:

- Sidebar and mobile nav pills in `AppLayout.tsx`.
- WorkOrder cards, next-step cards, status badges, and patch review panels.
- AutomationJobs tables/cards with long validation command output labels.
- Treasury tables with provider/model names and pricing labels.
- Agents fallback validation rows and provider/model selectors.
- Royal Brief stat cards and context-health cards.
- Dashboard metric cards and top action cards.

Recommended i18n preparation without implementing full i18n yet:

1. Create a small translation-key inventory while refactoring each page, not a global migration.
2. Add label helper maps for enums before adding locale switching.
3. Prefer semantic keys such as `workOrders.status.ready` over rendering raw `READY`.
4. Keep audit raw values available in details/tooltips where needed.
5. Add layout tests or Playwright screenshots for Thai text on Mission Control, Work Orders, Automation Jobs, Agents, and Providers.

## Quick Wins

- Add a local route registry constant derived from the current `main.tsx` routes when route work starts. Keep it developer-only until navigation is redesigned.
- Add `?focus=<id>` support consistently for WorkOrder, AutomationJob, CouncilSession, ProjectInboxItem, PatchArtifact, and KnowledgeCandidate detail selection.
- Add source chips to Dashboard, Inbox, Royal Brief, WorkOrders, and AutomationJobs using one shared display component.
- In Mission Control cards, show the owning route explicitly: "Source: WorkOrder", "Source: AutomationJob", "Source: Provider".
- Link provider issue cards to the exact provider/routing/treasury section instead of broad pages where possible.
- Move "Matters" and "Notices" out of the System mental model in nav labels, or make Inbox the explicit parent for them.
- Convert `Knowledge Lab` from a landing-only page into tabs for Candidates and Approved Memories.
- Add enum display maps before any Thai translation pass.

## Phased Implementation Plan

### Phase 1: Audit hardening and link consistency

- Keep all routes unchanged.
- Add shared source/provenance display conventions.
- Add consistent `focus` params for detail pages where the data model already supports it.
- Make Dashboard/Mission Control cards clearly read-only and source-linked.

### Phase 2: Mission Control consolidation

- Treat `/dashboard` as Mission Control.
- Move Inbox content into a Mission Control "Action Queue" section or tab while preserving `/inbox` as an alias during transition.
- Move Operations summary into a Mission Control "Operations" section or tab while preserving `/kingdom/operations`.
- Keep Royal Brief separate as dated digest with clear generated timestamp.

### Phase 3: Lifecycle detail pages

- Introduce Task/Council detail structure before renaming routes.
- Keep Work Orders as executable work owner, but link execution details to Automation Jobs.
- Add AutomationJob focused detail route or `?focus=` behavior.

### Phase 4: Providers & Models consolidation

- Group Providers, Routing, Treasury model pricing, and effective-agent request preview into one mental model.
- Keep existing write APIs and routes first; change navigation grouping before contracts.
- Add "effective model route" explanations in Agents and Providers.

### Phase 5: Reviews & Knowledge consolidation

- Convert Knowledge Lab into a tabbed review workspace.
- Decide whether legacy `/memory` remains manual institutional memory or becomes a tab under Knowledge.
- Keep Reports as final counsel archive, not raw execution output.

### Phase 6: i18n foundation

- Add enum label maps and a lightweight translation-key convention.
- Extract high-traffic page labels first: Mission Control, Work Orders, Automation Jobs, Agents, Providers.
- Run Thai/English layout checks before enabling a language toggle.

## Validation Notes

This audit changed documentation only. No TypeScript or runtime code was modified.

Suggested validation after this document lands:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

Because this is a documentation-only milestone, code validation is optional unless additional code changes are added.
