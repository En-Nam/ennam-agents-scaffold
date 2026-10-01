# SubagentStop hook - log-only.
# Appends "<timestamp> SubagentStop <agent_type>" to Serena QA evidence, but ONLY
# for this profile's roles (orchestrator / implementer / reviewer). SubagentStop
# also fires for Claude Code's internal agents and for un-typed workflow agents;
# logging those would bury the audit trail (v1.14: 19 fires for a 6-agent run).
# Never blocks: every path exits 0, including unreadable or malformed payloads.
# ASCII-only: PowerShell 5.1 default codepage decode chokes on non-ASCII.

$ErrorActionPreference = 'SilentlyContinue'
try {
  $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $agentType = [string]$payload.agent_type
} catch {
  exit 0
}
if (@('orchestrator', 'implementer', 'reviewer') -notcontains $agentType) {
  exit 0
}
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$logPath = Join-Path $PSScriptRoot "..\..\.serena\memories\qa\agent-org-log.md"
$dir = Split-Path $logPath
if (-not (Test-Path $dir)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
"- $timestamp SubagentStop $agentType" | Out-File -Append -Encoding utf8 -FilePath $logPath
exit 0
