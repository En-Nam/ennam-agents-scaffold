import { cac } from 'cac';
import { readFile, access } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getProfile } from './profiles.js';
import { enumerateFiles } from './enumerate.js';
import { scanConflicts } from './conflict.js';
import { buildPlan } from './plan.js';
import { executeOps } from './execute.js';
import { buildContext, renderFileEntry, renderJsonContent } from './render.js';
import { mergeMarker } from './merge/marker.js';
import { mergeJson } from './merge/json.js';
import { mergeLines } from './merge/lines.js';
import { printIntro, printPlan, confirmProceed, printNextSteps, printHandoffPrompt } from './ux.js';
import { runWizard } from './wizard.js';
import type { UserStrategy, OperationPlan } from './types.js';

// Re-export wizard types/functions so external callers (and tests) can keep
// importing from this file. The wizard module is the source of truth — no
// side-effects on import (cli.parse() is gated below).
export { runWizard, resolveProfile } from './wizard.js';
export type { Role, ProjectType, Stack } from './wizard.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(await readFile(path.join(HERE, '..', 'package.json'), 'utf8')) as { version: string };

const cli = cac('ennam-agents-scaffold');

cli
  .command('[profile]', 'Install Claude Code config into the current directory')
  .option('--dry-run', 'Print the plan without writing anything')
  .option('--force', 'Overwrite all conflicts without prompting (alias for --merge-strategy=overwrite)')
  .option('--merge-strategy <s>', 'ask | skip | overwrite (default: ask)', { default: 'ask' })
  .option('--no-prompts', 'Fail on missing info instead of prompting (CI mode)')
  .option('--verbose', 'Verbose output')
  .action(async (profileArg: string | undefined, flags: Record<string, unknown>) => {
    // cac normalises kebab-case flags: --dry-run → dryRun, --merge-strategy → mergeStrategy.
    // For --no-prompts, cac sets prompts: false (omit defaults to true).
    const interactive = flags.prompts !== false;

    let profileName = profileArg;
    if (!profileName) {
      if (!interactive) {
        console.error('Error: profile is required in --no-prompts mode');
        process.exit(2);
      }
      // Fail loud BEFORE printing the clack intro frame: a piped/non-TTY
      // invocation that forgot --no-prompts would otherwise see a half-rendered
      // box before the error (Rule 12 — fail loud, never with a dangling UI).
      if (!process.stdin.isTTY) {
        console.error('Error: interactive wizard requires a TTY. Pass a profile argument or use --no-prompts <profile>.');
        process.exit(2);
      }
      // Intro is printed BEFORE the wizard so the user sees the version they
      // are about to install. For the --no-prompts profile-arg path, we print
      // the intro after profile validation (below) to avoid leaving a dangling
      // clack frame on bad-profile errors.
      printIntro(PKG.version);
      profileName = await runWizard();
    }

    let profile;
    try {
      profile = getProfile(profileName);
    } catch (err) {
      // Clean stderr message, no stack trace (Rule 12 — fail loud, but cleanly).
      console.error(`Error: ${(err as Error).message}`);
      process.exit(2);
    }

    // For the direct-profile path (no wizard), defer intro until after the
    // profile name has been validated so a bad-profile error does not leave
    // an unclosed clack frame on stdout.
    if (profileArg) {
      printIntro(PKG.version);
    }

    const cwd = process.cwd();

    // Auto-detect: if there is no .git in cwd, the scaffold silently skips
    // git-only artifacts (today: .gitignore). No flag — works for every profile.
    let hasGit = true;
    try {
      await access(path.join(cwd, '.git'));
    } catch {
      hasGit = false;
    }

    const strategy: UserStrategy = (flags.force ? 'overwrite' : (flags.mergeStrategy as UserStrategy)) ?? 'ask';

    const entries = await enumerateFiles(profile);
    const ctx = buildContext({ profile: profileName, cwd, version: PKG.version });
    const byRel = new Map(entries.map(e => [e.relPath, e]));
    const provider = async (rel: string) => {
      const entry = byRel.get(rel);
      if (!entry) return null;
      if (entry.kind === 'append-marker') {
        // For marker-merge: "identical" means the existing file already contains the
        // expected marker block. Simulate the merge and compare to the full existing content.
        // Strip trailing \n from block to match execute.ts behaviour (mergeMarker idempotency).
        const block = (await renderFileEntry(entry, ctx)).replace(/\n$/, '');
        const abs = path.join(cwd, rel);
        let existing = '';
        try {
          existing = await readFile(abs, 'utf8');
        } catch {
          return null;  // file absent — scanConflicts handles absent separately
        }
        return mergeMarker(existing, block);
      }
      if (entry.kind === 'json-merge') {
        // For json-merge: "identical" means the existing file already has the same merged result.
        // Compute mergeJson(userExisting, scaffoldCombined) to match execute.ts exactly.
        let existingObj: Record<string, unknown> = {};
        try {
          const existingText = await readFile(path.join(cwd, rel), 'utf8');
          if (existingText.trim().length > 0) {
            existingObj = JSON.parse(existingText) as Record<string, unknown>;
          }
        } catch {
          return null;  // file absent — scanConflicts handles absent separately
        }
        const scaffoldObj = await renderJsonContent(entry, ctx);
        const merged = mergeJson(
          existingObj as Parameters<typeof mergeJson>[0],
          scaffoldObj as Parameters<typeof mergeJson>[0],
        );
        return JSON.stringify(merged, null, 2) + '\n';
      }
      if (entry.kind === 'append-lines') {
        // For append-lines: "identical" means mergeLines(existing, incoming) === existing.
        // Compute mergeLines to match execute.ts exactly.
        let existing = '';
        try {
          existing = await readFile(path.join(cwd, rel), 'utf8');
        } catch {
          return null;  // file absent — scanConflicts handles absent separately
        }
        const incoming = await renderFileEntry(entry, ctx);
        return mergeLines(existing, incoming);
      }
      return renderFileEntry(entry, ctx);
    };
    let conflicts;
    try {
      conflicts = await scanConflicts(cwd, entries.map(e => e.relPath), provider);
    } catch (err) {
      // Clean stderr (no stack trace) for known scan-time failures like
      // duplicate scaffold markers (Rule 12 — fail loud, but cleanly).
      console.error(`Error: ${(err as Error).message}`);
      process.exit(2);
    }
    const ops = buildPlan({ entries, conflicts, strategy, hasGit });
    const plan: OperationPlan = { cwd, profile, ops, hasGit };

    printPlan(plan);

    if (flags.dryRun) {
      console.log('\n(dry-run — no files written)');
      process.exit(0);
    }

    if (interactive) {
      const proceed = await confirmProceed();
      if (!proceed) process.exit(1);
    }

    const result = await executeOps({ cwd, ops, ctx, interactive });
    printNextSteps(profile, result, hasGit);

    // Migration hint: v1.1 users may still have a stale chrome-devtools entry
    // in their .mcp.json (mergeJson is user-wins, so the scaffold cannot
    // remove it). Surface a non-fatal warning so the user knows to clean up.
    await maybeWarnStaleChromeDevtools(cwd);

    // Hand off to the user: print a copy-paste prompt they can paste into
    // a fresh Claude Code session to seed project-specific context above the
    // scaffold marker block. Skipped in CI (--no-prompts) — there is no
    // human to paste it — and for local-root (no app to extract).
    if (interactive) {
      printHandoffPrompt(profile.name);
    }
  });

cli.help();
cli.version(PKG.version);

// Only execute the CLI when this file is run as the program entry point.
// Without this guard, `import { resolveProfile } from '@ennamjsc/agents-scaffold'`
// (or test imports) would fire the wizard on import.
//
// Under `npx`, `process.argv[1]` is the symlink in `node_modules/.bin/` while
// `import.meta.url` resolves to the real `dist/index.js`. Comparing the raw
// paths therefore never matches, the guard returns false, and the CLI silently
// exits 0 having done nothing. Realpath both sides before comparing.
const isMain = (() => {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    const hereReal = realpathSync(fileURLToPath(import.meta.url));
    const entryReal = realpathSync(entry);
    return hereReal === entryReal;
  } catch {
    return false;
  }
})();
if (isMain) {
  cli.parse();
}

async function maybeWarnStaleChromeDevtools(cwd: string): Promise<void> {
  try {
    const mcpPath = path.join(cwd, '.mcp.json');
    const txt = await readFile(mcpPath, 'utf8');
    const obj = JSON.parse(txt) as { mcpServers?: Record<string, unknown> };
    if (obj.mcpServers && Object.prototype.hasOwnProperty.call(obj.mcpServers, 'chrome-devtools')) {
      console.log();
      console.log('  Warning: .mcp.json still contains a `chrome-devtools` entry.');
      console.log('  v1.2 no longer ships chrome-devtools-mcp. Consider removing');
      console.log('  `mcpServers.chrome-devtools` manually. See README → Claude for');
      console.log('  Chrome integration.');
    }
  } catch {
    // No .mcp.json or unreadable — nothing to warn about.
  }
}
