#!/usr/bin/env bash
# SubagentStop hook - log-only. See subagent-log.ps1 for design rationale.
# No `set -e`: every path must exit 0 (a hook must never block a subagent).
# No jq: it is not guaranteed on the user's machine - extract agent_type with sed.
payload=$(cat 2>/dev/null || true)
agent_type=$(printf '%s' "$payload" | sed -n 's/.*"agent_type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
case "$agent_type" in
  orchestrator|implementer|reviewer) ;;
  *) exit 0 ;;
esac
timestamp=$(date '+%Y-%m-%d %H:%M:%S')
here="$(cd "$(dirname "$0")" && pwd)"
log_dir="$here/../../.serena/memories/qa"
mkdir -p "$log_dir" 2>/dev/null || exit 0
echo "- $timestamp SubagentStop $agent_type" >> "$log_dir/agent-org-log.md" 2>/dev/null
exit 0
