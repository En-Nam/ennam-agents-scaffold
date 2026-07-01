# SubagentStop hook - log-only.
# Appends a timestamped marker to Serena so the orchestrator sees which
# subagent runs happened during its dispatch window. Never blocks
# (exit 0 always). Payload is passed on stdin by Claude Code but ignored -
# the value is the timestamp trail, not the payload contents.
# ASCII-only: PowerShell 5.1 default codepage decode chokes on non-ASCII.

$ErrorActionPreference = 'SilentlyContinue'
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$logPath = Join-Path $PSScriptRoot "..\..\.serena\memories\comms\active\agent-org-log.md"
$dir = Split-Path $logPath
if (-not (Test-Path $dir)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
"- $timestamp SubagentStop" | Out-File -Append -Encoding utf8 -FilePath $logPath
exit 0
