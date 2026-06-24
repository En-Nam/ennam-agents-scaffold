import { select, isCancel, cancel, log } from '@clack/prompts';
import path from 'node:path';

// Wizard matrix: (role × projectType × stack?) → profile name.
// Exported as a pure function for unit testing; runWizard wraps it with prompts.
export type Role = 'Developer' | 'QA-QC';
export type ProjectType = 'Local-root' | 'Existing repository';
export type Stack = 'Next.js' | 'Flutter' | 'Python' | 'Go';

const STACK_TO_PROFILE: Record<Stack, string> = {
  'Next.js': 'next',
  'Flutter': 'flutter',
  'Python': 'python',
  'Go': 'go',
};

export function resolveProfile(role: Role, projectType: ProjectType, stack?: Stack): string {
  if (role === 'QA-QC') return 'qa';
  if (role === 'Developer') {
    if (projectType === 'Local-root') return 'local-root';
    if (projectType === 'Existing repository') {
      if (!stack) {
        throw new Error(`resolveProfile: stack is required for (Developer, Existing repository); got (${role}, ${projectType}, ${stack})`);
      }
      const name = STACK_TO_PROFILE[stack];
      if (!name) {
        throw new Error(`resolveProfile: unknown stack "${stack}" for (Developer, Existing repository)`);
      }
      return name;
    }
  }
  throw new Error(`resolveProfile: unknown combination (${role}, ${projectType}, ${stack ?? '<none>'})`);
}

export async function runWizard(cwd: string = process.cwd()): Promise<string> {
  // Fail loud on non-TTY stdin: a piped invocation forgetting `--no-prompts`
  // would otherwise hang or silently exit (Rule 12 — fail loud, never silent).
  if (!process.stdin.isTTY) {
    console.error('Error: interactive wizard requires a TTY. Pass a profile argument or use --no-prompts <profile>.');
    process.exit(2);
  }

  log.info(`Installing Claude Code tooling into ${path.basename(cwd)} — you will see a plan and confirm before any file is written.`);

  const role = await select<Role>({
    message: "What's your role?",
    options: [
      { value: 'Developer', label: 'Developer' },
      { value: 'QA-QC', label: 'QA-QC' },
    ],
    initialValue: 'Developer',
  });
  if (isCancel(role)) { cancel('Aborted.'); process.exit(1); }

  const projectType = await select<ProjectType>({
    message: 'What kind of project?',
    options: [
      { value: 'Existing repository', label: 'Existing repository' },
      { value: 'Local-root', label: 'Local-root (no .git — orchestration / scratch space)' },
    ],
    initialValue: 'Existing repository',
  });
  if (isCancel(projectType)) { cancel('Aborted.'); process.exit(1); }

  let stack: Stack | undefined;
  if (role === 'Developer' && projectType === 'Existing repository') {
    const picked = await select<Stack>({
      message: 'What stack?',
      options: [
        { value: 'Next.js', label: 'Next.js' },
        { value: 'Flutter', label: 'Flutter' },
        { value: 'Python', label: 'Python' },
        { value: 'Go', label: 'Go' },
      ],
      initialValue: 'Next.js',
    });
    if (isCancel(picked)) { cancel('Aborted.'); process.exit(1); }
    stack = picked;
  }

  return resolveProfile(role, projectType, stack);
}
