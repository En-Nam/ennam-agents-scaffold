import { cac } from 'cac';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { select, isCancel, cancel } from '@clack/prompts';
import { getProfile, listProfiles } from './profiles.js';
import { enumerateFiles } from './enumerate.js';
import { scanConflicts } from './conflict.js';
import { buildPlan } from './plan.js';
import { executeOps } from './execute.js';
import { buildContext, renderFileEntry } from './render.js';
import { printIntro, printPlan, confirmProceed, printNextSteps } from './ux.js';
import type { UserStrategy } from './types.js';

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
    printIntro(PKG.version);

    // cac normalises kebab-case flags: --dry-run → dryRun, --merge-strategy → mergeStrategy.
    // For --no-prompts, cac sets prompts: false (omit defaults to true).
    const interactive = flags.prompts !== false;

    let profileName = profileArg;
    if (!profileName) {
      if (!interactive) {
        console.error('Error: profile is required in --no-prompts mode');
        process.exit(2);
      }
      const choices = listProfiles().map(p => ({ value: p.name, label: `${p.name} — ${p.description}` }));
      const picked = await select({ message: 'Choose a profile:', options: choices });
      if (isCancel(picked)) { cancel('Aborted.'); process.exit(1); }
      profileName = picked as string;
    }

    const profile = getProfile(profileName);
    const cwd = process.cwd();
    const strategy: UserStrategy = (flags.force ? 'overwrite' : (flags.mergeStrategy as UserStrategy)) ?? 'ask';

    const entries = await enumerateFiles(profile);
    const ctx = buildContext({ profile: profileName, cwd, version: PKG.version });
    const byRel = new Map(entries.map(e => [e.relPath, e]));
    const provider = async (rel: string) => {
      const entry = byRel.get(rel);
      if (!entry) return null;
      return renderFileEntry(entry, ctx);
    };
    const conflicts = await scanConflicts(cwd, entries.map(e => e.relPath), provider);
    const ops = buildPlan({ entries, conflicts, strategy });
    const plan = { cwd, profile, ops };

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
    printNextSteps(profileName, result);
  });

cli.help();
cli.version(PKG.version);
cli.parse();
