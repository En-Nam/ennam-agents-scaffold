#!/usr/bin/env bash
# SubagentStop hook - log-only. See subagent-log.ps1 for design rationale.
set -eu
timestamp=$(date '+%Y-%m-%d %H:%M:%S')
here="$(cd "$(dirname "$0")" && pwd)"
log_dir="$here/../../.serena/memories/comms/active"
mkdir -p "$log_dir"
echo "- $timestamp SubagentStop" >> "$log_dir/agent-org-log.md"
exit 0
