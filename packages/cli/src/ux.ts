import pc from 'picocolors';
import { intro, outro, log, confirm, isCancel, cancel } from '@clack/prompts';
import type { OperationPlan, ProfileDef } from './types.js';
import type { ExecuteResult } from './execute.js';
import { buildKeyReport, formatKeyReportStep } from './env-scan.js';

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

export async function printNextSteps(profile: ProfileDef, result: ExecuteResult, hasGit: boolean, cwd: string, workflow?: string): Promise<void> {
  const steps: string[] = [];
  if (hasGit) {
    steps.push('Review changes: git diff');
  } else {
    steps.push('Inspect changes in your editor (no .git detected — run `git init` first if you want diff/version tracking)');
  }
  // v1.12 (#22) — derive required keys from the config actually written to disk (not a
  // hardcoded list), and tell the user where to obtain each still-missing one.
  steps.push(formatKeyReportStep(await buildKeyReport(cwd)));
  // v1.12 (#27) — verify the install any time with the read-only doctor.
  steps.push('Verify the install any time: npx @ennamjsc/agents-scaffold --doctor');
  // v1.12 (#26) — the workflow the agents follow lives in CLAUDE.md; it can be changed.
  steps.push(
    `Workflow: your agents follow the ${workflow ? `"${workflow}"` : 'role-recommended'} workflow (see the Workflow section in CLAUDE.md). ` +
    'Change it later with --workflow <id> on re-run, or by editing that section.',
  );
  // v1.12 (#24) — point users at the official-plugin menu (guidance only; nothing installed).
  steps.push('Amplify your role with official plugins — see docs/plugins.md: https://github.com/En-Nam/ennam-agents-scaffold/blob/main/docs/plugins.md');

  // v1.9.0 — agent-org profile needs a manual SubagentStop hook wire-in.
  // The shared settings.json.hbs merger doesn't support profile-specific hook
  // fragments yet (backlog: `.claude/settings.json.partial.hbs` merge, v1.10.x).
  // Surface the exact JSON so users don't have to guess. Rule 12 — fail loud.
  if (profile.name === 'agent-org') {
    steps.push('The SubagentStop hook is now installed automatically in .claude/settings.json (merged from the profile; the OS-correct .ps1/.sh command is already selected) — no manual paste needed.');
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

  // v1.12 (#28/#30) — Canva is a remote-OAuth MCP: static config (type:http, no token), but the
  // connect step is interactive and cannot be derived from the env-key scan. Surface it explicitly.
  if (profile.extraMcp.includes('canva')) {
    steps.push('Canva uses a remote MCP (interactive OAuth — no token to paste). On your first `claude` run, approve the project-scoped `canva` server, then run `/mcp` and sign in to Canva.');
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
