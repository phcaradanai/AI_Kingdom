# Merge notes — codex/archive-7a7a-bf3a420 → main

The Cowork sandbox can't run a conflicted `git merge` (its mount blocks file deletion, so
git can't clean its own lock files). So the conflicts were resolved here in advance and the
resolution is applied by `apply-codex-merge.sh`, which you run from your own terminal.

## What the codex branch contains
Two commits on top of `586cd00`: a Thai UI **i18n** system + a "Streamline king command
workflow" UI redesign of the Dashboard and Throne Room.

## Conflict analysis (merge-base 586cd00)
14 files changed on the branch. Against current `main`:

**Clean auto-merge (git handles):** `routes/settings.ts`, `services/settingsService.ts`,
`services/royalSecretaryService.ts` (+test), `types/api.ts`.

**Codex-only, applied as-is:** `lib/i18n.tsx` (new), `pages/SettingsPage.tsx` (+test).

**Real conflicts (resolved here):**
- `components/layout/AppLayout.tsx` — only the lucide-react import line conflicted. Resolved
  to the union (main's icons + `Languages`). The language toggle from codex auto-merged in.
- `main.tsx` — add `I18nProvider` import and wrap `<BrowserRouter>`, keeping **main's full
  route list** (codex's was older / missing routes).
- `pages/DashboardPage.tsx` (+test) and `pages/ThroneRoomPage.tsx` (+test) — **design
  divergence**, not a mechanical conflict. `main` already replaced these with the newer
  "Mission Control" Dashboard and the external-execution Throne Room flow. Codex's versions
  are the older "King's Desk" design. **Decision: keep main's versions** (`--ours`).

## Net effect
The app gains Thai language support (toggle in the layout + Settings), without regressing
main's newer Dashboard/Throne Room. Those two pages can be translated incrementally later
using the now-available `useI18n()` / `t()` API.

## How to apply
```bash
bash apply-codex-merge.sh
npm run typecheck && npm run test          # verify the merged tree
git commit                                 # completes the merge
rm -rf merge-resolved apply-codex-merge.sh MERGE_NOTES.md
git branch -d codex/archive-7a7a-bf3a420
```
If `npm run typecheck` flags anything in the auto-merged backend files
(`royalSecretaryService.ts`, `types/api.ts`), it'll be a small adjacent-edit overlap — open
the file and reconcile the two added blocks.
