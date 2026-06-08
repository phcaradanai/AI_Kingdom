# Prompt — Import Royal Agent Profiles into AI Kingdom

Implement seed/upsert logic to import the attached royal agent profile JSON files.

## Goal
Fill all current royal agent fields based on their Kingdom role. Agents are persistent royal officials, not disposable tools.

## Source of Truth
Use the JSON files in this folder:
- grand-vizier.json
- royal-architect.json
- royal-general.json
- royal-researcher.json
- royal-treasurer.json
- royal-promptsmith.json
- royal-archivist.json

## Hard Constraints
- Use idempotent upsert by slug or stable identifier.
- Do not create duplicate agents.
- If an existing Prompt Agent exists, migrate/update it into Vaelion / Royal Promptsmith instead of creating another prompt agent.
- Create Thaleon / Royal Archivist if missing.
- Do not overwrite King-customized values unless the field is empty or explicitly seed-managed.
- Do not expose API keys.
- Do not enable paid/production fallback during sandbox stabilization.
- All agents should use OpenRouter Free Sandbox as preferred provider and Local Sandbox Baseline as emergency fallback provider.
- DeepSeek must not be an active fallback during sandbox stabilization.
- Auto-save trusted memory must default false.
- Raw reasoning must never be stored as memory.

## Fields to Import
For each agent import:
- name
- title
- role
- specialty
- description
- personalDetail
- personality
- relationshipWithKing
- relationshipWithCouncil
- allowedActions
- forbiddenActions
- approvalRequiredFor
- roleBoundaries
- systemPrompt
- responseStyle
- skills
- memoryPolicy
- preferredProvider
- primaryModel
- fallbackModels
- fallbackProviders
- routingPolicy
- costPolicy
- modelParameters

## Validation
Run:
```bash
npm run db:seed
npm run test
npm run typecheck
npm run build
```

## Manual Acceptance
- Open `/agents`.
- Aurelian, Seraphine, Cassian, Elowen, Marcellus, Vaelion, and Thaleon exist exactly once.
- Prompt Agent is upgraded to Vaelion / Royal Promptsmith without duplication.
- Royal Archivist exists once.
- Each agent shows Royal Identity, Authority & Boundaries, Memory & Learning Policy, Routing Profile, and Model Parameters.
- DeepSeek is not shown as active fallback during sandbox.
