// Source 3a: package.json → app.name, app.tagline, stack.item (whitelist), command.
import { join } from 'node:path';
import { readJson } from '../../util/json.mjs';

const FILE = 'package.json';

/** Whitelist, in emission order: [package names…] → display. */
export const NODE_STACK = [
  [['next'], 'Next.js'],
  [['react'], 'React'],
  [['express'], 'Express'],
  [['@nestjs/core'], 'NestJS'],
  [['prisma', '@prisma/client'], 'Prisma'],
  [['tailwindcss'], 'Tailwind CSS'],
  [['vite'], 'Vite'],
  [['vue'], 'Vue'],
  [['svelte'], 'Svelte'],
  [['@sveltejs/kit'], 'SvelteKit'],
  [['nuxt'], 'Nuxt'],
  [['@angular/core'], 'Angular'],
  [['fastify'], 'Fastify'],
  [['hono'], 'Hono'],
  [['drizzle-orm'], 'Drizzle ORM'],
  [['mongoose'], 'Mongoose'],
  [['@tanstack/react-query'], 'TanStack Query'],
  [['graphql'], 'GraphQL'],
  [['socket.io'], 'Socket.IO'],
  [['electron'], 'Electron'],
  [['react-native'], 'React Native'],
  [['typescript'], 'TypeScript'],
  [['vitest'], 'Vitest'],
  [['jest'], 'Jest'],
  [['@playwright/test'], 'Playwright'],
];

const SCRIPTS = ['dev', 'build', 'start', 'test'];

export function collect(ctx) {
  if (!ctx.has(FILE)) return [];
  const pkg = readJson(join(ctx.root, FILE)); // malformed → E_JSON (fail loud)
  const out = [];
  const add = (kind, display, locator, rule) =>
    out.push({ kind, value: display, display, source: { file: FILE, locator, extractor: 'package-json', rule } });

  if (typeof pkg.name === 'string' && pkg.name.trim()) {
    add('app.name', pkg.name.trim().replace(/^@[^/]+\//, ''), 'name', 'package.json "name" (npm scope stripped) → app.name');
  }
  if (typeof pkg.description === 'string' && pkg.description.trim()) {
    add('app.tagline', pkg.description.trim(), 'description', 'package.json "description" → app.tagline');
  }
  for (const [names, display] of NODE_STACK) {
    for (const field of ['dependencies', 'devDependencies']) {
      const deps = pkg[field];
      const hit = deps && typeof deps === 'object' ? names.find((n) => Object.prototype.hasOwnProperty.call(deps, n)) : undefined;
      if (hit) {
        add('stack.item', display, `${field}.${hit}`, 'package.json dependencies/devDependencies whitelist → stack.item');
        break;
      }
    }
  }
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  for (const k of SCRIPTS) {
    if (typeof scripts[k] === 'string') add('command', `npm run ${k}`, `scripts.${k}`, 'package.json scripts dev/build/start/test → "npm run <script>"');
  }
  const hasBin = typeof pkg.bin === 'string' || (pkg.bin && typeof pkg.bin === 'object' && Object.keys(pkg.bin).length > 0);
  if (hasBin && typeof pkg.name === 'string' && pkg.name.trim()) {
    add('command', `npx ${pkg.name.trim()}`, 'bin', 'package.json "bin" → "npx <package name>"');
  }
  return out;
}
