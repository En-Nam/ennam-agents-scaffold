import { select, isCancel, cancel, log } from '@clack/prompts';
import path from 'node:path';

// Wizard matrix: (role × projectType × stack | cloud) → profile name.
// Exported as a pure function for unit testing; runWizard wraps it with prompts.
export type Role = 'Developer' | 'QA-QC' | 'BA' | 'HR' | 'DevOps';
export type ProjectType = 'Local-root' | 'Existing repository';
export type Stack = 'Next.js' | 'React' | 'React Native' | 'Flutter' | 'Python' | 'Go' | '.NET MVC' | 'Express.js';
export type Cloud = 'AWS' | 'Azure' | 'Google Cloud';

const STACK_TO_PROFILE: Record<Stack, string> = {
  'Next.js': 'next',
  'React': 'react',
  'React Native': 'react-native',
  'Flutter': 'flutter',
  'Python': 'python',
  'Go': 'go',
  '.NET MVC': 'dotnet-mvc',
  'Express.js': 'express',
};

const CLOUD_TO_PROFILE: Record<Cloud, string> = {
  'AWS': 'devops-aws',
  'Azure': 'devops-azure',
  'Google Cloud': 'devops-gcp',
};

export function resolveProfile(
  role: Role,
  projectType: ProjectType,
  stack?: Stack,
  cloud?: Cloud,
): string {
  if (role === 'QA-QC') return 'qa';
  if (role === 'BA') return 'ba';
  if (role === 'HR') return 'hr';
  if (role === 'DevOps') {
    if (!cloud) {
      throw new Error(`resolveProfile: cloud is required for DevOps role; got (${role}, ${projectType}, stack=${stack ?? '<none>'}, cloud=<none>)`);
    }
    const name = CLOUD_TO_PROFILE[cloud];
    if (!name) {
      throw new Error(`resolveProfile: unknown cloud "${cloud}" for DevOps role`);
    }
    return name;
  }
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
  throw new Error(`resolveProfile: unknown combination (${role}, ${projectType}, stack=${stack ?? '<none>'}, cloud=${cloud ?? '<none>'})`);
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
      { value: 'BA', label: 'Business Analyst' },
      { value: 'HR', label: 'HR' },
      { value: 'DevOps', label: 'DevOps' },
    ],
    initialValue: 'Developer',
  });
  if (isCancel(role)) { cancel('Aborted.'); process.exit(1); }

  // DevOps branches on cloud, not projectType.
  if (role === 'DevOps') {
    const cloud = await select<Cloud>({
      message: 'Which cloud?',
      options: [
        { value: 'AWS', label: 'AWS' },
        { value: 'Azure', label: 'Azure' },
        { value: 'Google Cloud', label: 'Google Cloud (GCP)' },
      ],
      initialValue: 'AWS',
    });
    if (isCancel(cloud)) { cancel('Aborted.'); process.exit(1); }
    // projectType is irrelevant for DevOps (the IaC repo is always an "existing repository"
    // in spirit). Pass a fixed value to satisfy the resolver signature.
    return resolveProfile(role, 'Existing repository', undefined, cloud);
  }

  // BA and HR do not branch on projectType or stack — single-profile roles.
  if (role === 'BA' || role === 'HR') {
    return resolveProfile(role, 'Existing repository');
  }

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
        { value: 'React', label: 'React (Vite SPA)' },
        { value: 'React Native', label: 'React Native (Expo)' },
        { value: 'Flutter', label: 'Flutter' },
        { value: 'Python', label: 'Python' },
        { value: 'Go', label: 'Go' },
        { value: '.NET MVC', label: '.NET MVC (C#)' },
        { value: 'Express.js', label: 'Express.js (Node + TS)' },
      ],
      initialValue: 'Next.js',
    });
    if (isCancel(picked)) { cancel('Aborted.'); process.exit(1); }
    stack = picked;
  }

  return resolveProfile(role, projectType, stack);
}
