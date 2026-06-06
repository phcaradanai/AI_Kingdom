# Next Task

## M11: Audit Log UI + Operational Oversight

Goal: make the M9 audit foundation visible and useful to the King without adding new authentication providers or background infrastructure.

## Scope

1. Add Audit Log API endpoints:
   - `GET /api/audit`
   - `GET /api/audit/:id`
   - `GET /api/audit/search?q=`
   - Filters for `action`, `resourceType`, `userId`, and date range.

2. Protect audit access:
   - `KING` can read all audit logs.
   - Other roles cannot access audit logs.
   - Do not expose password hashes, refresh token hashes, JWTs, API keys, or secrets in audit responses.

3. Add `/audit` frontend page:
   - King-only navigation item.
   - Search and filters.
   - Table/list of audit events.
   - Detail panel with timestamp, actor, action, resource, and safe metadata.

4. Improve operational visibility:
   - Show API and database health in `/security` or `/settings`.
   - Surface current auth role and session status clearly.

5. Tests:
   - King can list audit logs.
   - Non-King access is denied.
   - Audit search/filter works.
   - Sensitive token/hash fields are never returned.

6. Documentation:
   - Update PROJECT_STATUS.md, ARCHITECTURE.md, NEXT_TASK.md, and AGENTS.md if behavior or contributor guidance changes.

## Constraints

- Do not add SSO, OAuth, MFA, or password reset.
- Do not add background workers.
- Do not add external monitoring vendors.
- Do not expose secrets or token hashes.
- Keep the feature staging-friendly and PostgreSQL-backed.
