import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { makeStoryboard, type DigestFact } from './helpers/storyboard';
import { resolveFfmpeg } from '../../templates/showreel/.claude/showreel/lib/render/ffmpeg.mjs';

// v1.16 showreel — end to end on a freshly scaffolded repo (gated: SHOWREEL_E2E=1 + SHOWREEL_TOOL_DIR).
// This is the M1 exit proof (mem:decisions/showreel-addon-v1.16): a `<role> showreel` install runs
// preflight → facts → check --sheet → render → verify and the MP4 is EXACTLY N s (D13):
// video N×fps frames, audio N×48000 samples ±1024 (one AAC frame). The storyboard comes from a
// deterministic helper (no LLM). The render/verify JSON (timings) is printed for the evidence log.
// Set SHOWREEL_E2E_ARTIFACTS=<dir> to keep sheet.png + the MP4s for visual inspection.

const E2E = process.env.SHOWREEL_E2E === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');
const NEXT_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'next-project');
const JS_APP = path.join(HERE, 'fixtures', 'facts', 'js-next');
const PY_FIXTURE = path.join(HERE, 'fixtures', 'facts', 'python-fastapi');
const ARTIFACTS = process.env.SHOWREEL_E2E_ARTIFACTS;
const AAC_FRAME = 1024;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Out = { ok: boolean; cmd: string; [k: string]: any };

describe.skipIf(!E2E)('showreel end to end on a scaffolded repo (SHOWREEL_E2E=1)', () => {
  const temps: string[] = [];

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  }, 120_000);
  afterAll(() => {
    for (const t of temps) rmSync(t, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  async function scaffold(fixture: string, roles: string[]) {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'showreel-e2e-'));
    temps.push(cwd);
    cpSync(fixture, cwd, { recursive: true });
    await execa('git', ['init', '-q'], { cwd });
    const r = await execa('node', [CLI_ENTRY, ...roles, 'showreel', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(r.exitCode).toBe(0);
    expect(existsSync(path.join(cwd, '.claude', 'showreel', 'cli.mjs'))).toBe(true);
    return cwd;
  }

  async function sr(cwd: string, ...args: string[]): Promise<Out> {
    const r = await execa('node', [path.join('.claude', 'showreel', 'cli.mjs'), ...args], { cwd, reject: false });
    const lines = r.stdout.trim().split('\n');
    const line = lines[lines.length - 1]!;
    console.log(line);
    if (ARTIFACTS) { mkdirSync(ARTIFACTS, { recursive: true }); appendFileSync(path.join(ARTIFACTS, 'e2e.jsonl'), line + '\n'); }
    expect(lines.length, `one JSON line from ${args.join(' ')}; stderr: ${r.stderr}`).toBe(1);
    const out = JSON.parse(line) as Out;
    expect(out.ok, `${args.join(' ')} failed: ${line}`).toBe(true);
    expect(r.exitCode).toBe(0);
    return out;
  }

  /** A command that must FAIL: exit 1, one JSON line, the given error code. */
  async function srFail(cwd: string, code: string, ...args: string[]): Promise<Out> {
    const r = await execa('node', [path.join('.claude', 'showreel', 'cli.mjs'), ...args], { cwd, reject: false });
    const lines = r.stdout.trim().split('\n');
    console.log(lines[lines.length - 1]);
    expect(lines.length, `one JSON line from ${args.join(' ')}; stderr: ${r.stderr}`).toBe(1);
    const out = JSON.parse(lines[0]!) as Out;
    expect(out, lines[0]).toMatchObject({ ok: false, error: { code } });
    expect(r.exitCode).toBe(1);
    return out;
  }

  /** Mutate one build file, run verify (expecting `code`), restore the file. */
  async function verifyTampered(cwd: string, rel: string, mutate: (v: any) => any, code: string): Promise<string> {
    const file = path.join(cwd, 'showreel', 'build', rel);
    const original = readFileSync(file, 'utf8');
    writeFileSync(file, JSON.stringify(mutate(JSON.parse(original))));
    try {
      return (await srFail(cwd, code, 'verify')).error.message as string;
    } finally {
      writeFileSync(file, original);
    }
  }

  /** Replace the rendered film with an ffmpeg-tampered copy, run verify (expecting E_VERIFY), restore the film. */
  async function verifyTamperedFilm(cwd: string, rel: string, ffArgs: (src: string, dst: string) => string[]): Promise<string> {
    const film = path.join(cwd, rel);
    const backup = path.join(cwd, 'showreel', 'build', 'film.orig.mp4');
    const tampered = path.join(cwd, 'showreel', 'build', 'film.tampered.mp4');
    copyFileSync(film, backup);
    await execa(resolveFfmpeg(cwd), ['-y', '-hide_banner', '-loglevel', 'error', ...ffArgs(backup, tampered)]);
    copyFileSync(tampered, film);
    try {
      return (await srFail(cwd, 'E_VERIFY', 'verify')).error.message as string;
    } finally {
      copyFileSync(backup, film);
      rmSync(backup);
      rmSync(tampered);
    }
  }

  const pngSize = (file: string) => { const b = readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

  function keep(cwd: string, name: string, rels: string[]) {
    if (!ARTIFACTS) return;
    const dir = path.join(ARTIFACTS, name);
    mkdirSync(dir, { recursive: true });
    for (const rel of rels) copyFileSync(path.join(cwd, rel), path.join(dir, path.basename(rel)));
  }

  function expectPolicy(render: Out, mode: 'final' | 'draft') {
    const gpuLess = /swiftshader/i.test(render.renderer);
    if (mode === 'final') {
      expect(render).toMatchObject({ fps: 60, crf: 18, samples: gpuLess ? 1 : 6, gpu: !gpuLess });
      if (gpuLess) expect(render.notice).toBe('no GPU detected — motion blur reduced (S=1)');
      else expect(render.notice).toBeUndefined();
    } else {
      expect(render).toMatchObject({ fps: 30, samples: 1 });
    }
    for (const k of ['check', 'score', 'frames', 'encode', 'mux', 'verify', 'total']) expect(render.timings[k], k).toBeGreaterThanOrEqual(0);
  }

  function expectExact(verify: Out, N: number, fps: number) {
    expect(verify.videoFrames).toBe(N * fps);
    expect(verify.expected).toEqual({ frames: N * fps, samples: N * 48000 });
    expect(Math.abs(verify.audioSamples - N * 48000)).toBeLessThanOrEqual(AAC_FRAME);
    expect(verify).toMatchObject({ streamsOk: true, scoreOk: true, hitsOk: true, manifestOk: true, determinismOk: true });
    expect(verify.peakDbfs).toBeLessThanOrEqual(-1);
  }

  it('next showreel: preflight → facts → check --sheet → render --final → verify = exactly 30 s (1800 frames)', async () => {
    const cwd = await scaffold(NEXT_FIXTURE, ['next']);
    // tests/fixtures/next-project is a bare package.json (fails the D4 gate by design); give it the
    // js-next app sources so facts has a real app to describe.
    for (const rel of ['app', 'lib', 'README.md', 'package.json']) cpSync(path.join(JS_APP, rel), path.join(cwd, rel), { recursive: true });

    const pre = await sr(cwd, 'preflight');
    expect(pre.browser.kind).toMatch(/chrome|edge|chromium|custom/);
    const facts = await sr(cwd, 'facts');
    expect(facts.gate.passed).toBe(true);
    writeFileSync(path.join(cwd, 'showreel', 'storyboard.json'), JSON.stringify(makeStoryboard(facts.digest as DigestFact[], 30), null, 2));

    const check = await sr(cwd, 'check', '--sheet');
    expect(check).toMatchObject({ beats: 7, sheet: 'showreel/build/sheet.png' });
    expect(pngSize(path.join(cwd, 'showreel', 'build', 'sheet.png'))).toEqual({ w: 1920, h: 270 * 4 });
    const resolved = JSON.parse(readFileSync(path.join(cwd, 'showreel', 'build', 'resolved.json'), 'utf8'));
    for (const b of Object.values<any>(resolved.beats)) for (const s of Object.values<any>(b.slots)) if (s.items.length) expect(s.fitSizePx).toBeGreaterThan(0);

    const render = await sr(cwd, 'render', '--final');
    expect(render).toMatchObject({ out: 'showreel/acme-shop-30s.mp4', mode: 'final', frames: 1800 });
    expectPolicy(render, 'final');
    expect(existsSync(path.join(cwd, render.out))).toBe(true);
    expect(existsSync(path.join(cwd, 'showreel', 'build', 'acme-shop-30s.unverified.mp4'))).toBe(false); // moved on pass

    const verify = await sr(cwd, 'verify');
    expectExact(verify, 30, 60);
    expect(render.verify).toMatchObject({ videoFrames: 1800 });
    keep(cwd, 'next', ['showreel/build/sheet.png', render.out]);
  }, 20 * 60_000);

  it('python showreel: preflight → facts → check → render --draft → verify = exactly 15 s (450 frames @ 30 fps)', async () => {
    const cwd = await scaffold(PY_FIXTURE, ['python']);
    await sr(cwd, 'preflight');
    const facts = await sr(cwd, 'facts');
    expect(facts.gate.passed).toBe(true);
    writeFileSync(path.join(cwd, 'showreel', 'storyboard.json'), JSON.stringify(makeStoryboard(facts.digest as DigestFact[], 15), null, 2));

    const check = await sr(cwd, 'check');
    expect(check.beats).toBe(4);
    const render = await sr(cwd, 'render', '--draft');
    expect(render).toMatchObject({ out: 'showreel/inventory-api-15s-draft.mp4', mode: 'draft', frames: 450 });
    expectPolicy(render, 'draft');

    const verify = await sr(cwd, 'verify');
    expectExact(verify, 15, 30);
    keep(cwd, 'python', [render.out]);

    // verify must be able to FAIL (Rule 9/12): it is the only gate for D9, D8 and D13. Tamper with a
    // copy of the rendered repo, one artifact at a time, and expect the matching check to fire.
    const neg = mkdtempSync(path.join(os.tmpdir(), 'showreel-e2e-neg-'));
    temps.push(neg);
    cpSync(cwd, neg, { recursive: true });

    // D9: a recorded frame hash that the fresh page cannot reproduce
    const flip = (h: string) => (h[0] === '0' ? '1' : '0') + h.slice(1);
    const det = await verifyTampered(neg, 'determinism.json', (d) => { d.points[1].sha256 = flip(d.points[1].sha256); return d; }, 'E_VERIFY');
    expect(det).toContain('determinism');
    expect(det).toContain('middle-overlap');

    // D8 subset: drawn text not traceable to a resolved fact/phrase
    const hacked = await verifyTampered(neg, 'manifest.json', (m) => [...m, { text: 'Hacked', source: 'f.x' }], 'E_VERIFY');
    expect(hacked).toContain('untraceable');
    expect(hacked).toContain('Hacked');

    // D8 coverage: a resolved item that was never drawn (drop an entry whose source occurs once)
    const manifest = JSON.parse(readFileSync(path.join(neg, 'showreel', 'build', 'manifest.json'), 'utf8')) as { source: string }[];
    const once = manifest.find((e) => /^[fp]\./.test(e.source) && manifest.filter((x) => x.source === e.source).length === 1);
    expect(once, 'a manifest entry with a unique fact/phrase source').toBeDefined();
    const dropped = await verifyTampered(neg, 'manifest.json', (m: { source: string }[]) => m.filter((e) => e.source !== once!.source), 'E_VERIFY');
    expect(dropped).toContain('never drawn');
    expect(dropped).toContain(once!.source);

    // the record no longer matches the build → stale, not a toolkit bug
    await verifyTampered(neg, 'render.json', (r) => ({ ...r, fps: 60 }), 'E_STALE_RENDER');

    // D13 "EXACTLY N s": a film cut short must be rejected by the frame count …
    const truncated = await verifyTamperedFilm(neg, render.out, (src, dst) => ['-i', src, '-t', '14', '-c', 'copy', dst]);
    expect(truncated).toContain('videoFrames');
    // … and a film whose AUDIO alone is 1 s short (video intact) by the sample count.
    const shortAudio = await verifyTamperedFilm(neg, render.out, (src, dst) => [
      '-i', src, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy',
      '-af', 'atrim=end=14', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', dst,
    ]);
    expect(shortAudio).toContain('audioSamples');
    expect(shortAudio).not.toContain('videoFrames');

    // untouched copy still verifies: the failures above came from the tampering alone
    await sr(neg, 'verify');
  }, 10 * 60_000);
});

// Registered only when E2E is off: a full E2E run must report 0 skipped (Rule 12).
if (!E2E) {
  describe('showreel end to end (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run next/python showreel preflight → facts → check → render → verify', () => {});
  });
}
