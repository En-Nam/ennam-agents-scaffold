import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { storyboardFromArrangement, type ArrangementBeat, type DigestFact } from './helpers/storyboard';
import { resolveFfmpeg } from '../../templates/showreel/.claude/showreel/lib/render/ffmpeg.mjs';

// v1.16 showreel M2 exit — AC1 on two profiles at all 4 durations (gated: SHOWREEL_E2E_FULL=1 + SHOWREEL_TOOL_DIR).
// next + python, each scaffolded fresh, then for 15/30/45/60 s: storyboard from the recommended arrangement
// (archetypes/arrangements.json, C15) bound to the repo's OWN facts by the deterministic helper (no LLM, no
// invented copy) → check --sheet → render --final → verify. Every film must be EXACTLY N s (D13: N×60 video
// frames, N×48000 ± 1024 audio samples), pass every verify gate, and be tagged limited-range BT.709 — proven
// twice: by verify's colorTags AND by an independent read of the ffmpeg stream banner (yuv420p(tv, bt709…)).
// One JSON line per film (render + verify output, timings) goes to $SHOWREEL_E2E_ARTIFACTS/e2e-full.jsonl, with
// the sheet, storyboard, timeline and resolved files kept per film (the R5 tool renders from next-60s). Every
// duration runs even after a failure (soft assertions), so a single run shows all 8 results.
// If a repo's facts cannot fill an arrangement at the typical item count, the helper falls back to the MINIMUM
// counts (still only real facts), the line says so (`count`) and a soft assertion FAILS the run — the fallback
// film is still rendered and verified for the full picture, but it is weaker AC1 evidence and must surface
// (Rule 12). It never pads with invented facts.

const FULL = process.env.SHOWREEL_E2E_FULL === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');
const TOOLKIT = path.join(REPO_ROOT, 'templates', 'showreel', '.claude', 'showreel');
const NEXT_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'next-project');
const JS_APP = path.join(HERE, 'fixtures', 'facts', 'js-next');
const PY_FIXTURE = path.join(HERE, 'fixtures', 'facts', 'python-fastapi');
const ARTIFACTS = process.env.SHOWREEL_E2E_ARTIFACTS;
const AAC_FRAME = 1024;
const DURATIONS = [15, 30, 45, 60] as const;
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const ARR: Record<string, ArrangementBeat[]> = readJ(path.join(TOOLKIT, 'archetypes', 'arrangements.json')).arrangements;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Out = { ok: boolean; cmd: string; [k: string]: any };

describe.skipIf(!FULL)('showreel e2e-full: next + python × 15/30/45/60 s --final (SHOWREEL_E2E_FULL=1)', () => {
  const temps: string[] = [];

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E_FULL=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  }, 180_000);
  afterAll(() => {
    for (const t of temps) rmSync(t, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }, 120_000);

  async function scaffold(fixture: string, role: string) {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'showreel-e2e-full-'));
    temps.push(cwd);
    cpSync(fixture, cwd, { recursive: true });
    await execa('git', ['init', '-q'], { cwd });
    const r = await execa('node', [CLI_ENTRY, role, 'showreel', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(r.exitCode).toBe(0);
    return cwd;
  }

  /** run one toolkit command → its single JSON line (parsed); `strict` asserts ok + exit 0 */
  async function sr(cwd: string, args: string[], strict = true): Promise<Out> {
    const r = await execa('node', [path.join('.claude', 'showreel', 'cli.mjs'), ...args], { cwd, reject: false });
    const lines = r.stdout.trim().split('\n');
    const line = lines[lines.length - 1]!;
    expect(lines.length, `one JSON line from ${args.join(' ')}; stderr: ${r.stderr}`).toBe(1);
    const out = JSON.parse(line) as Out;
    if (strict) {
      expect(out.ok, `${args.join(' ')} failed: ${line}`).toBe(true);
      expect(r.exitCode).toBe(0);
    } else {
      expect(r.exitCode, `${args.join(' ')}: exit code matches ok`).toBe(out.ok ? 0 : 1);
    }
    return out;
  }

  /** arrangement storyboard at typical counts; falls back to min counts (never to invented facts) */
  function storyboard(digest: DigestFact[], N: (typeof DURATIONS)[number]) {
    try {
      return { count: 'typical', sb: storyboardFromArrangement(digest, N, ARR[String(N)]!, ARCH, PHRASES, { count: 'typical' }) };
    } catch (typicalErr) {
      console.warn(`[e2e-full] ${N} s: typical counts not fillable (${(typicalErr as Error).message}); using min counts`);
      return { count: 'min', sb: storyboardFromArrangement(digest, N, ARR[String(N)]!, ARCH, PHRASES, { count: 'min' }) };
    }
  }

  async function bannerColor(cwd: string, rel: string) {
    const r = await execa(resolveFfmpeg(cwd), ['-hide_banner', '-i', path.join(cwd, rel)], { reject: false });
    return /Stream #\d+:\d+[^:]*: Video: .*/.exec(r.stderr)?.[0] ?? '';
  }

  function keep(cwd: string, name: string, rels: string[]) {
    if (!ARTIFACTS) return;
    const dir = path.join(ARTIFACTS, name);
    mkdirSync(dir, { recursive: true });
    for (const rel of rels) copyFileSync(path.join(cwd, rel), path.join(dir, path.basename(rel)));
  }

  for (const [profile, role, fixture] of [['next', 'next', NEXT_FIXTURE], ['python', 'python', PY_FIXTURE]] as const) {
    it(`${profile}: 15/30/45/60 s --final from arrangements → verify ok, N×60 frames, N×48000±1024 samples, BT.709 tags`, async () => {
      const cwd = await scaffold(fixture, role);
      // tests/fixtures/next-project is a bare package.json (fails the D4 gate by design): give it the js-next app
      if (profile === 'next') for (const rel of ['app', 'lib', 'README.md', 'package.json']) cpSync(path.join(JS_APP, rel), path.join(cwd, rel), { recursive: true });
      await sr(cwd, ['preflight']);
      const facts = await sr(cwd, ['facts']);
      expect(facts.gate.passed).toBe(true);
      const digest = facts.digest as DigestFact[];

      // every duration is rendered and logged even when an earlier one fails (soft assertions), so one run
      // gives the full 4-duration picture for the profile
      for (const N of DURATIONS) {
        const { count, sb } = storyboard(digest, N);
        expect(sb.beats.map((b) => `${b.archetype}/${b.variant}`)).toEqual(ARR[String(N)]!.map((b) => `${b.archetype}/${b.variant}`));
        writeFileSync(path.join(cwd, 'showreel', 'storyboard.json'), JSON.stringify(sb, null, 2));

        const check = await sr(cwd, ['check', '--sheet']);
        expect(check.beats).toBe(sb.beats.length);
        keep(cwd, `${profile}-${N}s`, ['showreel/storyboard.json', 'showreel/build/timeline.json', 'showreel/build/resolved.json', 'showreel/build/sheet.png']);
        const render = await sr(cwd, ['render', '--final'], false);
        const verify = render.ok ? await sr(cwd, ['verify'], false) : null;
        const banner = render.ok ? await bannerColor(cwd, render.out) : null;
        const line = JSON.stringify({ profile, durationS: N, count, beats: sb.beats.length, archetypes: [...new Set(sb.beats.map((b) => b.archetype))].length, check: { ms: check.ms, hits: check.hits }, render, verify, banner });
        console.log(line);
        if (ARTIFACTS) { mkdirSync(ARTIFACTS, { recursive: true }); appendFileSync(path.join(ARTIFACTS, 'e2e-full.jsonl'), line + '\n'); }

        const tag = `${profile} ${N}s`;
        // the exit evidence is the arrangement at TYPICAL counts: a min-count fallback (the fixture can no longer
        // fill typical) still renders and is logged, but fails the run visibly instead of passing as weaker proof
        expect.soft(count, `${tag}: storyboard fell back to MIN slot counts (the fixture's facts cannot fill typical)`).toBe('typical');
        expect.soft(render.ok, `${tag} render --final: ${JSON.stringify(render.error ?? null)}`).toBe(true);
        if (!render.ok) continue;
        expect.soft(render, tag).toMatchObject({ mode: 'final', fps: 60, frames: N * 60 });
        expect.soft(render.out, tag).toMatch(new RegExp(`-${N}s\\.mp4$`));
        // D13 exactly N s, every verify gate, BT.709 (verify + independent banner read)
        expect.soft(verify!.ok, `${tag} verify: ${JSON.stringify(verify!.error ?? null)}`).toBe(true);
        expect.soft(verify!.videoFrames, `${tag} frames`).toBe(N * 60);
        expect.soft(verify!.expected, tag).toEqual({ frames: N * 60, samples: N * 48000 });
        expect.soft(Math.abs(verify!.audioSamples - N * 48000), `${tag} samples ${verify!.audioSamples}`).toBeLessThanOrEqual(AAC_FRAME);
        expect.soft(verify, tag).toMatchObject({ streamsOk: true, scoreOk: true, hitsOk: true, manifestOk: true, determinismOk: true, colorTagsOk: true });
        expect.soft(verify!.colorTags, tag).toEqual({ range: 'tv', space: 'bt709', primaries: 'bt709', trc: 'bt709' });
        expect.soft(banner, `${tag} stream banner`).toMatch(/yuv420p\(tv, bt709[,)]/);
        expect.soft(verify!.peakDbfs, tag).toBeLessThanOrEqual(-1);
        expect.soft(existsSync(path.join(cwd, render.out)), tag).toBe(true);
        rmSync(path.join(cwd, render.out), { force: true }); // keep disk use flat across 4 films
      }
    }, 60 * 60_000);
  }
});

// Registered only when the full run is off, so the skip is visible (Rule 12) and a FULL run reports 0 skipped.
if (!FULL) {
  describe('showreel e2e-full (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E_FULL=1 (+ SHOWREEL_TOOL_DIR, optional SHOWREEL_E2E_ARTIFACTS) to render next + python at 15/30/45/60 s --final', () => {});
  });
}
