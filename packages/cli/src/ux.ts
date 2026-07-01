import pc from 'picocolors';
import { intro, outro, log, confirm, isCancel, cancel } from '@clack/prompts';
import type { OperationPlan, ProfileDef } from './types.js';
import type { ExecuteResult } from './execute.js';

export function printIntro(version: string): void {
  intro(pc.cyan(`Ennam Agents Scaffold v${version}`));
}

export function printPlan(plan: OperationPlan): void {
  const lines: string[] = [];
  for (const op of plan.ops) {
    const marker = op.op === 'write' ? pc.green('+ write ') : op.op === 'mkdir' ? pc.blue('+ mkdir ') : op.op === 'merge-json' || op.op === 'merge-marker' || op.op === 'merge-lines' ? pc.yellow('~ merge ') : pc.gray('  skip  ');
    lines.push(`${marker} ${op.relPath}  ${pc.dim(`(${op.reason})`)}`);
  }
  log.step(`Plan (${plan.ops.length} ops):\n  ${lines.join('\n  ')}`);
}

export async function confirmProceed(): Promise<boolean> {
  const yes = await confirm({ message: 'Proceed?', initialValue: true });
  if (isCancel(yes)) {
    cancel('Aborted.');
    return false;
  }
  return yes === true;
}

export function printNextSteps(profile: ProfileDef, result: ExecuteResult, hasGit: boolean): void {
  const envVars = ['JIRA_URL', 'JIRA_TOKEN'];
  if (profile.extraMcp.includes('figma')) envVars.push('FIGMA_TOKEN');
  if (profile.extraMcp.includes('github')) envVars.push('GITHUB_TOKEN');
  if (profile.extraMcp.includes('postgres')) envVars.push('PG_CONN_STR');
  if (profile.name === 'game-unity') envVars.push('TRIPO_API_KEY');
  const steps: string[] = [];
  if (hasGit) {
    steps.push('Review changes: git diff');
  } else {
    steps.push('Inspect changes in your editor (no .git detected — run `git init` first if you want diff/version tracking)');
  }
  steps.push(`Set env vars in .env.local: ${envVars.join(', ')}`);

  // v1.9.0 — agent-org profile needs a manual SubagentStop hook wire-in.
  // The shared settings.json.hbs merger doesn't support profile-specific hook
  // fragments yet (backlog: `.claude/settings.json.partial.hbs` merge, v1.10.x).
  // Surface the exact JSON so users don't have to guess. Rule 12 — fail loud.
  if (profile.name === 'agent-org') {
    steps.push(
      'Register the SubagentStop hook in .claude/settings.json — paste this into your `hooks` object:\n' +
      '        "SubagentStop": [\n' +
      '          {\n' +
      '            "hooks": [\n' +
      '              { "type": "command", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/subagent-log.ps1" }\n' +
      '            ]\n' +
      '          }\n' +
      '        ]'
    );
    steps.push('On non-Windows: swap the command to `bash .claude/hooks/subagent-log.sh` (the .sh script is shipped alongside).');
    steps.push('COST DISCLOSURE: agent-org runs Opus orchestrator + Sonnet workers concurrently — 5-10x tokens vs solo. Only dispatch when task decomposition genuinely helps.');
    steps.push('Requires Claude Code >= 2.1.178 (post-TeamCreate/Delete removal + team_name deprecation). The wizard preflight will WARN if you are behind.');
  }

  // Profile-specific prereq + post-install reminders (game-unity has the heaviest setup —
  // two extra runtimes (Python+uv for Unity MCP, ADB for build/deploy) plus a Tripo3D
  // commercial-tier license gate. Surface loudly per Rule 12 — silent default = bad UX.
  if (profile.name === 'game-unity') {
    steps.push('Verify host prereqs: `uvx --version` (Python >= 3.11) and `adb --version` — install uv from https://docs.astral.sh/uv/getting-started/installation/ if missing');
    steps.push('Install CoplayDev Unity MCP in Unity Editor: Window > Package Manager > + > Add package from git URL > https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#v9.7.3');
    steps.push('Disable Domain Reload: Edit > Project Settings > Editor > Enter Play Mode Settings > UNCHECK Reload Domain (required for Unity MCP bridge stability)');
    steps.push('Copy Editor templates into your Unity project: `cp Editor-templates/EnnamPreflight.cs Editor-templates/EnnamPerf.cs Assets/Editor/`');
    steps.push('Initialize Git LFS: `git lfs install && git add .gitattributes && git commit -m "Add Git LFS rules"`');
    steps.push('Fill in GDD.md + art-bible.md + docs/perf-budget.md (agents will STOP at placeholders per Rule 12)');
    steps.push('Tripo3D asset-pipeline skill DEFAULTS to --dry-run (no API calls). To make real Tripo API calls: pass --live and confirm Pro tier ($13.93/mo annual minimum — Free tier is CC BY 4.0 NON-COMMERCIAL).');
  }

  steps.push('Start Claude Code: claude');
  steps.push('Inside Claude: accept the Superpowers plugin trust prompt (provides the superpowers:* workflow skills referenced by CLAUDE.md). Headless/CI sessions do not auto-install — run `/plugin install superpowers@claude-plugins-official` once. Requires Claude Code >= 2.1.');
  steps.push('Inside Claude: run /boot');
  outro(
    pc.cyan(`Done.`) +
    `\n  Profile: ${pc.bold(profile.name)}` +
    `\n  Written: ${result.written}  Skipped: ${result.skipped}  Mkdir: ${result.mkdirs}`
  );
  console.log();
  steps.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
}

/**
 * Print a copy-paste prompt the user pastes into Claude Code to seed
 * project-specific context ABOVE the scaffold-managed marker block in
 * CLAUDE.md. Skipped for `local-root` (no app-shape to extract) — that
 * profile is the polyrepo coordinator, not an app codebase.
 *
 * The prompt itself is the contract with Claude. The hard constraint is
 * the boundary rule: Claude must NOT touch content between the markers.
 * Grounding rules force file-cited claims. Diff-before-write provides a
 * dry-run signal so a bad invocation doesn't corrupt CLAUDE.md.
 */
export function printHandoffPrompt(profileName: string): void {
  if (profileName === 'local-root') return;

  const prompt = HANDOFF_PROMPT.trim();
  const border = pc.dim('─'.repeat(72));

  console.log();
  console.log(pc.bold(pc.cyan('Next: seed project-specific context in CLAUDE.md')));
  console.log(pc.dim('Paste the prompt below into a fresh `claude` session at this directory.'));
  console.log(pc.dim('It fills in the project profile ABOVE the scaffold-managed block.'));
  console.log();
  console.log(border);
  console.log(prompt);
  console.log(border);
  console.log();
}

const HANDOFF_PROMPT = `
You are seeding project context for a fresh Ennam Agents Scaffold install.

BOUNDARY RULE (hard):
- CLAUDE.md contains a scaffold-managed block delimited by these exact lines:
    <!-- ennam-agents-scaffold:begin v... -->
    <!-- ennam-agents-scaffold:end -->
- You MUST NOT modify, reorder, or remove anything between those markers.
- You write ONLY above the begin marker. Leave one blank line before it.

TASK:
Fill the area above the begin marker with these sections, in order:
  1. Project one-liner — what this repo is, who it serves, in one sentence.
  2. Stack — language + framework versions + key libraries.
  3. Key directories — 5-7 most-important paths with a one-line purpose each.
  4. Run / build / test commands — exact shell commands, copy-pasteable.
  5. Conventions — naming / error handling / imports — only ones actually in use.
  6. Hot zones — files or directories that break easily; warn future agents.

GROUNDING RULES:
- Every claim must come from a file you opened. Cite the path inline.
  Example: "Next.js 16 (package.json:14)".
- If you cannot verify a fact from a file, write "?" and surface it back.
  Do NOT guess.
- Read these before writing: package.json (or equivalent — go.mod, pyproject.toml,
  *.csproj, pubspec.yaml, Cargo.toml), tsconfig.json, README.md, top-level
  config files, and the 5 most recently modified source files.

OUTPUT:
- Before saving, show a unified diff of your proposed change and ask for
  confirmation.
- After confirmation, write to CLAUDE.md.
- Run no other tools after writing.
`;
