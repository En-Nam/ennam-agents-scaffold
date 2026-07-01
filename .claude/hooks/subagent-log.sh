#!/usr/bin/env bash
# v1.9.0 meta-spike — SubagentStop hook.
# See subagent-log.ps1 for design rationale. Log-only, exit 0 always.
set -eu
timestamp=$(date '+%Y-%m-%d %H:%M:%S')
here="$(cd "$(dirname "$0")" && pwd)"
log_dir="$here/../../.serena/memories/comms/active"
mkdir -p "$log_dir"
echo "- $timestamp — SubagentStop" >> "$log_dir/spike-log.md"
exit 0
