import { select, multiselect, isCancel, cancel, log } from '@clack/prompts';
import path from 'node:path';
import { listProfiles } from './profiles.js';
import { WORKFLOW_PRESETS, recommendWorkflow } from './workflow.js';
import type { ProfileDef } from './types.js';

// Wizard matrix: (role × projectType × stack | cloud | gameStack) → profile name.
// Exported as a pure function for unit testing; runWizard wraps it with prompts.
export type Role = 'Developer' | 'QA-QC' | 'BA' | 'PM' | 'Tech-Writer' | 'Data' | 'HR' | 'DevOps' | 'Game-Dev' | 'Agent-Org' | 'Executive' | 'Design';
export type ProjectType = 'Local-root' | 'Existing repository';
export type Stack = 'Next.js' | 'React' | 'React Native' | 'Flutter' | 'Python' | 'Go' | '.NET MVC' | 'Express.js';
export type Cloud = 'AWS' | 'Azure' | 'Google Cloud' | 'Docker';
export type GameStack = 'Unity 2.5D Mobile';
export type QAKind = 'Manual' | 'Automation';
// v1.12 (#29) — the Executive role group sub-selects a chief (mirrors QA-QC's 2-option sub-select).
export type ExecRole = 'CEO' | 'CISO';

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

const EXEC_ROLE_TO_PROFILE: Record<ExecRole, string> = {
  'CEO': 'ceo',
  'CISO': 'ciso',
};

export function resolveProfile(
  role: Role,
  projectType: ProjectType,
  stack?: Stack,
  cloud?: Cloud,
  gameStack?: GameStack,
  qaKind?: QAKind,
  execRole?: ExecRole,
): string {
  if (role === 'QA-QC') {
    // Rule 12 defense-in-depth: mirror the DevOps/Game-Dev enum-throws pattern
    // so a bogus JSON-fed value (e.g., 'Manuall') fails loud instead of silently
    // falling back to 'qa'. Interactive wizard cannot produce a bad value; this
    // guards direct callers of resolveProfile.
    if (qaKind !== undefined && qaKind !== 'Manual' && qaKind !== 'Automation') {
      throw new Error(`resolveProfile: unknown qaKind "${qaKind}" for QA-QC role (expected "Manual" | "Automation" | undefined)`);
    }
    return qaKind === 'Automation' ? 'qa-automation' : 'qa';
  }
  if (role === 'BA') return 'ba';
  if (role === 'PM') return 'pm';
  if (role === 'Tech-Writer') return 'tech-writer';
  if (role === 'Data') return 'data-analytics';
  if (role === 'Agent-Org') return 'agent-org';
  if (role === 'HR') return 'hr';
  if (role === 'Design') return 'design';
  if (role === 'Executive') {
    // Mirror the DevOps/Game-Dev enum-throw pattern so a bogus JSON-fed value fails loud
    // instead of silently defaulting (Rule 12). The wizard cannot produce a bad value.
    if (!execRole) {
      throw new Error(`resolveProfile: execRole is required for Executive role; got (${role}, ${projectType}, execRole=<none>)`);
    }
    const name = EXEC_ROLE_TO_PROFILE[execRole];
    if (!name) {
      throw new Error(`resolveProfile: unknown execRole "${execRole}" for Executive role (expected "CEO" | "CISO")`);
    }
    return name;
  }
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

/**
 * v1.11 (#7 + #10) — the wizard may now return MORE than one profile to compose.
 * First it offers single-role (guided) vs compose-several (multiselect). Single-role
 * keeps the original guided flow untouched.
 */
export async function runWizard(cwd: string = process.cwd()): Promise<string[]> {
  // Fail loud on non-TTY stdin: a piped invocation forgetting `--no-prompts`
  // would otherwise hang or silently exit (Rule 12 — fail loud, never silent).
  if (!process.stdin.isTTY) {
    console.error('Error: interactive wizard requires a TTY. Pass a profile argument or use --no-prompts <profile>.');
    process.exit(2);
  }

  log.info(`Installing Claude Code tooling into ${path.basename(cwd)} — you will see a plan and confirm before any file is written.`);

  const mode = await select<'single' | 'compose'>({
    message: 'Install a single role, or compose several?',
    options: [
      { value: 'single', label: 'Single role (guided: role → stack)' },
      { value: 'compose', label: 'Compose several profiles (multi-role repo — advanced)' },
    ],
    initialValue: 'single',
  });
  if (isCancel(mode)) { cancel('Aborted.'); process.exit(1); }

  if (mode === 'compose') {
    const picked = await multiselect<string>({
      message: 'Pick the profiles to compose (space toggles, enter confirms):',
      options: listProfiles().map(p => ({ value: p.name, label: p.name, hint: p.description })),
      required: true,
    });
    if (isCancel(picked)) { cancel('Aborted.'); process.exit(1); }
    return picked as string[];
  }

  return [await chooseSingleProfile()];
}

/** The original guided single-role flow. Returns exactly one profile name. */
async function chooseSingleProfile(): Promise<string> {
  const role = await select<Role>({
    message: "What's your role?",
    options: [
      { value: 'Developer', label: 'Developer' },
      { value: 'QA-QC', label: 'QA-QC' },
      { value: 'BA', label: 'Business Analyst' },
      { value: 'PM', label: 'Product Manager / PO' },
      { value: 'Tech-Writer', label: 'Technical Writer / Docs' },
      { value: 'Data', label: 'Data & Analytics' },
      { value: 'HR', label: 'HR' },
      { value: 'Executive', label: 'Executive / Leadership (CEO, CISO)' },
      { value: 'Design', label: 'Design / UX' },
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

  // Executive branches on the chief (CEO/CISO), mirroring QA-QC's 2-option sub-select.
  if (role === 'Executive') {
    const execRole = await select<ExecRole>({
      message: 'Which executive role?',
      options: [
        { value: 'CEO', label: 'CEO / executive (strategy, OKRs, board decks, investor updates)' },
        { value: 'CISO', label: 'CISO / security (policy, risk register, incident briefs, control maps)' },
      ],
      initialValue: 'CEO',
    });
    if (isCancel(execRole)) { cancel('Aborted.'); process.exit(1); }
    return resolveProfile(role, 'Existing repository', undefined, undefined, undefined, undefined, execRole);
  }

  // BA, PM, Tech-Writer, Data, HR, and Design do not branch on projectType or stack — single-profile roles.
  if (role === 'BA' || role === 'PM' || role === 'Tech-Writer' || role === 'Data' || role === 'HR' || role === 'Design') {
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

/**
 * v1.12 (#26) — after the profile(s) are chosen, ask which workflow the agents should
 * follow (the phase list written into CLAUDE.md). The role-appropriate preset is
 * pre-selected so a novice can just press Enter; override-only presets (quick-change,
 * decision-brief) are offered but never the default. Returns the chosen preset id.
 */
export async function chooseWorkflow(profiles: ProfileDef[]): Promise<string> {
  const recommended = recommendWorkflow(profiles);
  const picked = await select<string>({
    message: 'Which workflow should your agents follow? (Written into CLAUDE.md — you can change it later.)',
    options: WORKFLOW_PRESETS.map(p => ({
      value: p.id,
      label: p.id === recommended ? `${p.label}  (recommended)` : p.label,
      hint: p.hint,
    })),
    initialValue: recommended,
  });
  if (isCancel(picked)) { cancel('Aborted.'); process.exit(1); }
  return picked as string;
}
