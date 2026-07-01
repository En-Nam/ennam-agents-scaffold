import { select, isCancel, cancel, log } from '@clack/prompts';
import path from 'node:path';

// Wizard matrix: (role × projectType × stack | cloud | gameStack) → profile name.
// Exported as a pure function for unit testing; runWizard wraps it with prompts.
export type Role = 'Developer' | 'QA-QC' | 'BA' | 'HR' | 'DevOps' | 'Game-Dev' | 'Agent-Org';
export type ProjectType = 'Local-root' | 'Existing repository';
export type Stack = 'Next.js' | 'React' | 'React Native' | 'Flutter' | 'Python' | 'Go' | '.NET MVC' | 'Express.js';
export type Cloud = 'AWS' | 'Azure' | 'Google Cloud' | 'Docker';
export type GameStack = 'Unity 2.5D Mobile';
export type QAKind = 'Manual' | 'Automation';

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
  'Docker': 'devops-docker',
};

const GAME_STACK_TO_PROFILE: Record<GameStack, string> = {
  'Unity 2.5D Mobile': 'game-unity',
};

export function resolveProfile(
  role: Role,
  projectType: ProjectType,
  stack?: Stack,
  cloud?: Cloud,
  gameStack?: GameStack,
  qaKind?: QAKind,
): string {
  if (role === 'QA-QC') return qaKind === 'Automation' ? 'qa-automation' : 'qa';
  if (role === 'BA') return 'ba';
  if (role === 'Agent-Org') return 'agent-org';
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
  if (role === 'Game-Dev') {
    if (!gameStack) {
      throw new Error(`resolveProfile: gameStack is required for Game-Dev role; got (${role}, ${projectType}, gameStack=<none>)`);
    }
    const name = GAME_STACK_TO_PROFILE[gameStack];
    if (!name) {
      throw new Error(`resolveProfile: unknown gameStack "${gameStack}" for Game-Dev role`);
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
  throw new Error(`resolveProfile: unknown combination (${role}, ${projectType}, stack=${stack ?? '<none>'}, cloud=${cloud ?? '<none>'}, gameStack=${gameStack ?? '<none>'})`);
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
      { value: 'Game-Dev', label: 'Game-Dev (Unity)' },
      { value: 'Agent-Org', label: 'Agent-Org (multi-agent dispatch — advanced, cost-heavy)' },
    ],
    initialValue: 'Developer',
  });
  if (isCancel(role)) { cancel('Aborted.'); process.exit(1); }

  // Game-Dev branches on gameStack, not projectType or cloud.
  if (role === 'Game-Dev') {
    const gameStack = await select<GameStack>({
      message: 'Which game engine + stack?',
      options: [
        { value: 'Unity 2.5D Mobile', label: 'Unity 2.5D mobile (URP — CoplayDev MCP + Tripo3D dry-run default)' },
      ],
      initialValue: 'Unity 2.5D Mobile',
    });
    if (isCancel(gameStack)) { cancel('Aborted.'); process.exit(1); }
    return resolveProfile(role, 'Existing repository', undefined, undefined, gameStack);
  }

  // DevOps branches on cloud, not projectType.
  if (role === 'DevOps') {
    const cloud = await select<Cloud>({
      message: 'Which cloud / infra target?',
      options: [
        { value: 'AWS', label: 'AWS' },
        { value: 'Azure', label: 'Azure' },
        { value: 'Google Cloud', label: 'Google Cloud (GCP)' },
        { value: 'Docker', label: 'Docker (self-hosted; Komodo + Tailscale)' },
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

  // Agent-Org is a stack-agnostic augmentation — no branching.
  if (role === 'Agent-Org') {
    return resolveProfile(role, 'Existing repository');
  }

  // QA-QC branches on kind (Manual → qa, Automation → qa-automation).
  if (role === 'QA-QC') {
    const kind = await select<QAKind>({
      message: 'Manual QA or Automation?',
      options: [
        { value: 'Manual', label: 'Manual QA (test cases + evidence capture)' },
        { value: 'Automation', label: 'Automation (Maestro mobile + Playwright web + Gherkin BDD)' },
      ],
      initialValue: 'Manual',
    });
    if (isCancel(kind)) { cancel('Aborted.'); process.exit(1); }
    return resolveProfile(role, 'Existing repository', undefined, undefined, undefined, kind);
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
