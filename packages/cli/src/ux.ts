import pc from 'picocolors';
import { intro, outro, log, confirm, isCancel, cancel } from '@clack/prompts';
import type { OperationPlan } from './types.js';
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

export function printNextSteps(profile: string, result: ExecuteResult): void {
  const steps = [
    'Review changes: git diff',
    'Set env vars in .env.local: JIRA_URL, JIRA_TOKEN, FIGMA_TOKEN',
    'Start Claude Code: claude',
    'Inside Claude: run /boot',
  ];
  outro(
    pc.cyan(`Done.`) +
    `\n  Profile: ${pc.bold(profile)}` +
    `\n  Written: ${result.written}  Skipped: ${result.skipped}  Mkdir: ${result.mkdirs}`
  );
  console.log();
  steps.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
}
