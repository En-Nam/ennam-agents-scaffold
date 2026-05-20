import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { ProfileDef } from './types.js';

// In dev (running from src or dist inside the monorepo), templates live at repo root.
// In published package, templates live alongside dist/ inside the package.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATE_PUBLISHED = path.join(HERE, '..', 'templates');     // dist/../templates
const CANDIDATE_MONOREPO  = path.join(HERE, '..', '..', '..', 'templates'); // packages/cli/dist/../../../templates
const TEMPLATES = existsSync(CANDIDATE_PUBLISHED) ? CANDIDATE_PUBLISHED : CANDIDATE_MONOREPO;

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
