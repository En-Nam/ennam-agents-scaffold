import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ProfileDef } from './types.js';

// Resolve repo root from this module's URL.
// dist/index.js lives at <repo>/packages/cli/dist/index.js,
// templates live at <repo>/templates/. Walk up 3 levels.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const TEMPLATES = path.join(REPO_ROOT, 'templates');

const REGISTRY: Record<string, ProfileDef> = {
  next: {
    name: 'next',
    description: 'Next.js 16 App Router + React 19 + TS strict',
    templateDir: path.join(TEMPLATES, 'next'),
    extraMcp: ['chrome-devtools', 'figma'],
  },
  // flutter, python, go, qa added in Plan 2
};

export function getProfile(name: string): ProfileDef {
  const p = REGISTRY[name];
  if (!p) throw new Error(`Unknown profile: "${name}". Available: ${Object.keys(REGISTRY).join(', ')}`);
  return p;
}

export function listProfiles(): ProfileDef[] {
  return Object.values(REGISTRY);
}

export function getSharedDir(): string {
  return path.join(TEMPLATES, '_shared');
}
