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
    extraMcp: ['figma'],
  },
  flutter: {
    name: 'flutter',
    description: 'Flutter 3.x + Dart + Riverpod/Bloc + dio',
    templateDir: path.join(TEMPLATES, 'flutter'),
    extraMcp: ['figma'],
  },
  python: {
    name: 'python',
    description: 'Python 3.12 + FastAPI + uv + ruff + pytest',
    templateDir: path.join(TEMPLATES, 'python'),
    extraMcp: [],
  },
  go: {
    name: 'go',
    description: 'Go 1.24 + stdlib net/http + pgx + slog',
    templateDir: path.join(TEMPLATES, 'go'),
    extraMcp: [],
  },
  react: {
    name: 'react',
    description: 'React 19 SPA — Vite 6 + React Router 7 + TanStack Query + shadcn/ui + Tailwind 4 + Vitest + Playwright',
    templateDir: path.join(TEMPLATES, 'react'),
    extraMcp: ['figma'],
  },
  'react-native': {
    name: 'react-native',
    description: 'React Native 0.76+ New Architecture + Expo SDK 52+ + Expo Router + NativeWind + Reanimated 3 + Jest + Maestro',
    templateDir: path.join(TEMPLATES, 'react-native'),
    extraMcp: ['figma'],
  },
  'dotnet-mvc': {
    name: 'dotnet-mvc',
    description: '.NET 9 + ASP.NET Core MVC + EF Core + xUnit',
    templateDir: path.join(TEMPLATES, 'dotnet-mvc'),
    extraMcp: ['postgres', 'github'],
  },
  express: {
    name: 'express',
    description: 'Node 20 + Express 5 + TypeScript strict + Jest + Zod',
    templateDir: path.join(TEMPLATES, 'express'),
    extraMcp: ['github'],
  },
  qa: {
    name: 'qa',
    description: 'QA workflow — test cases, evidence',
    templateDir: path.join(TEMPLATES, 'qa'),
    extraMcp: [],
  },
  ba: {
    name: 'ba',
    description: 'Business Analyst — requirements, user stories, BPMN flows, acceptance criteria',
    templateDir: path.join(TEMPLATES, 'ba'),
    extraMcp: [],
  },
  hr: {
    name: 'hr',
    description: 'HR — job descriptions, interview kits, onboarding, performance reviews',
    templateDir: path.join(TEMPLATES, 'hr'),
    extraMcp: [],
  },
  'devops-aws': {
    name: 'devops-aws',
    description: 'DevOps — Terraform + AWS (ECS, RDS, IAM, Secrets Manager, CloudWatch)',
    templateDir: path.join(TEMPLATES, 'devops-aws'),
    extraMcp: ['github'],
  },
  'devops-azure': {
    name: 'devops-azure',
    description: 'DevOps — Bicep/Terraform + Azure (AKS, App Service, Key Vault, Log Analytics)',
    templateDir: path.join(TEMPLATES, 'devops-azure'),
    extraMcp: ['github'],
  },
  'devops-gcp': {
    name: 'devops-gcp',
    description: 'DevOps — Terraform + GCP (GKE, Cloud Run, Cloud SQL, Secret Manager, Cloud Logging)',
    templateDir: path.join(TEMPLATES, 'devops-gcp'),
    extraMcp: ['github'],
  },
  'devops-docker': {
    name: 'devops-docker',
    description: 'DevOps — Self-hosted Docker infra (Komodo GitOps + Tecnativa socket-proxy + Tailscale sidecar + Dozzle + Renovate)',
    templateDir: path.join(TEMPLATES, 'devops-docker'),
    extraMcp: ['github'],
  },
  'local-root': {
    name: 'local-root',
    description: 'Orchestration root — polyrepo coordinator, reads sub-platform .serena/ memories',
    templateDir: path.join(TEMPLATES, 'local-root'),
    extraMcp: [],
  },
  'game-unity': {
    name: 'game-unity',
    description: 'Game-Dev — Unity 6.x + URP mobile (2.5D); CoplayDev Unity MCP + Tripo3D asset gen (dry-run default) + LFS',
    templateDir: path.join(TEMPLATES, 'game-unity'),
    // Unity MCP is wired via this profile's own .mcp.json.partial.hbs (CoplayDev/unity-mcp).
    // extraMcp is reserved for _shared MCP catalog entries — Unity is profile-specific.
    extraMcp: [],
  },
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
