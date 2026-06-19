#!/usr/bin/env bash
#
# Resolve & complete the merge of codex/archive-7a7a-bf3a420 into main.
# Run this from your own terminal (the Cowork sandbox can't manage git lock files).
#
# Resolution decisions (see MERGE_NOTES.md):
#   - Bring in codex's Thai i18n system + Settings language option (additive, no regression).
#   - KEEP main's newer Dashboard ("Mission Control") and Throne Room — codex's versions
#     are an older design that main already superseded.
#   - Merge i18n into main.tsx (I18nProvider wrapper) and AppLayout (language toggle).
#
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "==> Starting merge (conflicts expected; we resolve them below)…"
git merge --no-ff --no-commit codex/archive-7a7a-bf3a420 || true

echo "==> Keeping main's newer UI for the design-divergent pages…"
git checkout --ours -- \
  apps/web/src/pages/DashboardPage.tsx \
  apps/web/src/pages/DashboardPage.test.tsx \
  apps/web/src/pages/ThroneRoomPage.tsx \
  apps/web/src/pages/ThroneRoomPage.test.tsx

echo "==> Applying prepared resolutions (i18n added onto main)…"
cp merge-resolved/apps/web/src/components/layout/AppLayout.tsx apps/web/src/components/layout/AppLayout.tsx
cp merge-resolved/apps/web/src/main.tsx                          apps/web/src/main.tsx

echo "==> Staging…"
git add -A
# Don't commit the helper files themselves:
git reset -q -- merge-resolved apply-codex-merge.sh MERGE_NOTES.md 2>/dev/null || true

echo
echo "Remaining conflict markers (should be none):"
grep -rEl '^(<<<<<<<|>>>>>>>)' apps --include='*.ts' --include='*.tsx' || echo "  none ✔"
echo
echo "Next — run these yourself (verify before the irreversible branch deletes):"
echo "  1) npm run typecheck && npm run test:api && npm --workspace @ai-kingdom/web run test"
echo "  2) git commit            # completes the merge commit on main"
echo "  3) rm -rf merge-resolved apply-codex-merge.sh MERGE_NOTES.md   # remove helpers"
echo "  4) Clean branches down to just main:"
echo "       git branch -d codex/archive-7a7a-bf3a420      # now merged → safe -d"
echo "       git branch -d claude/vigorous-tharp-c14478    # already merged + on origin"
echo "       git push origin --delete claude/vigorous-tharp-c14478   # (optional) remove the remote copy"
echo
echo "If instead you want to DISCARD codex's work entirely (keep main as-is, no merge):"
echo "       git merge --abort 2>/dev/null; git branch -D codex/archive-7a7a-bf3a420; git branch -d claude/vigorous-tharp-c14478"
