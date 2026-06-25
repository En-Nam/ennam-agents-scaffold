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
  const steps: string[] = [];
  if (hasGit) {
    steps.push('Review changes: git diff');
  } else {
    steps.push('Inspect changes in your editor (no .git detected — run `git init` first if you want diff/version tracking)');
  }
  steps.push(`Set env vars in .env.local: ${envVars.join(', ')}`);
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
