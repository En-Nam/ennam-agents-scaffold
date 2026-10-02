// Dev/CI tool (not shipped) — the Linux release prerequisite set by the PO (R4: "verified on Windows; Linux
// verified in CI; macOS untested"). It runs what /showreel runs, off Windows, without an LLM:
//   fresh `next showreel` install → preflight (cold npm ci of the toolkit deps) → facts → a deterministic
//   arrangement storyboard (the e2e helper) → check --sheet → render --draft → render --final → verify.
// Asserts the Linux-specific promises: Chrome is detected, --no-sandbox is applied only via SHOWREEL_NO_SANDBOX=1,
// and on a GPU-less runner --final falls back to S=1 with the loud notice. Prints one JSON line per step.
//   node tests/showreel/tools/ci-draft-render.mjs [artifactsDir]     (Node >= 23.6: imports the .ts helper)
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storyboardFromArrangement } from '../helpers/storyboard.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, '.showreel-dev', 'ci-linux'));
const GPU_NOTICE = 'no GPU detected — motion blur reduced (S=1)';
const TK = path.join(REPO, 'templates', 'showreel', '.claude', 'showreel');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

mkdirSync(OUT, { recursive: true });
const cwd = mkdtempSync(path.join(tmpdir(), 'showreel-ci-'));
const fail = (msg) => { console.log(JSON.stringify({ ok: false, step: 'assert', error: msg })); process.exit(1); };
const sr = (...args) => {
  let out;
  try { out = execFileSync(process.execPath, ['.claude/showreel/cli.mjs', ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 }); }
  catch (e) { out = String(e.stdout || ''); }
  const j = JSON.parse(out.trim().split('\n').pop());
  console.log(JSON.stringify({ step: args.join(' '), ...j, digest: undefined }));
  if (!j.ok) fail(`${args.join(' ')} failed: ${j.error?.code} ${j.error?.message}`);
  return j;
};

cpSync(path.join(REPO, 'tests', 'fixtures', 'next-project'), cwd, { recursive: true });
execFileSync('git', ['init', '-q'], { cwd });
execFileSync(process.execPath, [path.join(REPO, 'packages', 'cli', 'dist', 'index.js'), 'next', 'showreel', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
for (const rel of ['app', 'lib', 'README.md', 'package.json']) cpSync(path.join(REPO, 'tests', 'showreel', 'fixtures', 'facts', 'js-next', rel), path.join(cwd, rel), { recursive: true });

const pre = sr('preflight', '--expect', '1.0.0');
const browser = pre.steps.find((s) => s.name === 'browser');
if (!/chrome|chromium/i.test(JSON.stringify(browser))) fail(`no Chrome/Chromium detected: ${JSON.stringify(browser)}`);
if (process.env.SHOWREEL_NO_SANDBOX === '1' && !JSON.stringify(pre).includes('--no-sandbox')) fail('SHOWREEL_NO_SANDBOX=1 but --no-sandbox not in the launch args');

const facts = sr('facts');
const sb = storyboardFromArrangement(facts.digest, 15, read(path.join(TK, 'archetypes', 'arrangements.json')).arrangements['15'],
  read(path.join(TK, 'archetypes', 'archetypes.json')), read(path.join(TK, 'phrases.json')));
writeFileSync(path.join(cwd, 'showreel', 'storyboard.json'), JSON.stringify(sb, null, 2));

sr('check', '--sheet');
const draft = sr('render', '--draft');
if (draft.frames !== 15 * 30) fail(`draft frames ${draft.frames} != 450`);
const final = sr('render', '--final');
if (final.frames !== 15 * 60) fail(`final frames ${final.frames} != 900`);
if (!final.gpu) {
  if (final.samples !== 1) fail(`GPU-less runner but --final used S=${final.samples} (expected the S=1 fallback)`);
  if (final.notice !== GPU_NOTICE) fail(`GPU-less runner but notice was ${JSON.stringify(final.notice)}`);
}
const verify = sr('verify');
for (const k of ['streamsOk', 'colorTagsOk', 'scoreOk', 'hitsOk', 'manifestOk', 'determinismOk']) if (verify[k] !== true) fail(`verify.${k} = ${verify[k]}`);

for (const rel of ['showreel/build/sheet.png', final.out]) copyFileSync(path.join(cwd, rel), path.join(OUT, path.basename(rel)));
writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ platform: process.platform, node: process.version, browser, renderer: final.renderer,
  gpu: final.gpu, samples: final.samples, notice: final.notice ?? null, draft: draft.timings, final: final.timings, verify }, null, 2));
console.log(JSON.stringify({ ok: true, step: 'done', platform: process.platform, gpu: final.gpu, samples: final.samples, notice: final.notice ?? null }));
