#!/bin/sh
# Claude Code Stop hook: keeps the agent working while `pnpm check` (the vite-plus `gate` task) fails.
# Exit 2 blocks the stop and shows stderr to the agent.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
cat > /dev/null
[ -z "$(git status --porcelain)" ] && exit 0
if output=$(./node_modules/.bin/vp run gate 2>&1); then exit 0; fi
printf '%s\n' "$output" | tail -80 >&2
echo "pnpm check failed. Fix the errors above (each message says how), then finish." >&2
exit 2
