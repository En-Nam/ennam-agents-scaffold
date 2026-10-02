import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPolicy, slugify, determinismPoints, parseRenderArgs } from '../../templates/showreel/.claude/showreel/lib/render/policy.mjs';
import { encodeArgs, JPEG_QUALITY } from '../../templates/showreel/.claude/showreel/render/encode.mjs';
import { muxArgs } from '../../templates/showreel/.claude/showreel/render/mux.mjs';
import { parseFrameCount, parseStreams, decodeWav } from '../../templates/showreel/.claude/showreel/render/verify.mjs';
import { sheetTimes, sheetArgs } from '../../templates/showreel/.claude/showreel/render/sheet.mjs';
import { encodeWav } from '../../templates/showreel/.claude/showreel/lib/score/wav.mjs';
import { GPU_NOTICE } from '../../templates/showreel/.claude/showreel/lib/preflight/plan.mjs';
import { undrawn, inputHashes, streamsOk } from '../../templates/showreel/.claude/showreel/lib/verify/run.mjs';
import { paths as showreelPaths } from '../../templates/showreel/.claude/showreel/lib/util/paths.mjs';
import { useSession, bootEngine, ENGINE_BOOT_MS } from '../../templates/showreel/.claude/showreel/lib/render/session.mjs';
import { verifyAndPublish, unverifiedPath } from '../../templates/showreel/.claude/showreel/lib/render/cmd.mjs';
import { ShowreelError } from '../../templates/showreel/.claude/showreel/lib/util/out.mjs';
import fg from 'fast-glob';

// v1.16 showreel — check / render / verify, hermetic half (no browser, no ffmpeg).
// Why these matter (mem:decisions/showreel-addon-v1.16, M0 RULINGS + D8/D13):
//   - a bad storyboard must fail BEFORE a browser starts, as one JSON line naming the slot (the agent
//     fixes the storyboard from that message alone);
//   - the render policy is a PO ruling (S/fps/crf, GPU-less fallback + exact notice) — a silent drift
//     changes film quality or blows the 15-min budget;
//   - mux must NOT use -shortest (D12/D13: exact duration comes from the timeline, not from whichever
//     stream ends first);
//   - verify counts must come from ffmpeg output parsing that survives \r progress lines.
// The browser/ffmpeg half is tests/showreel/e2e.test.ts (SHOWREEL_E2E=1).

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel', 'cli.mjs');
const TRUTH = path.join(HERE, 'fixtures', 'truth');
const ENGINE_TL = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'engine', 'timeline.json'), 'utf8'));

function host(files: Record<string, unknown> = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'showreel-cli-'));
  for (const [rel, v] of Object.entries(files)) {
    const p = path.join(root, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  }
  return root;
}
function cli(args: string[], root: string) {
  const r = spawnSync(process.execPath, [CLI, ...args, '--root', root], { encoding: 'utf8' });
  const lines = r.stdout.trim().split('\n');
  expect(lines.length, `one JSON line expected, got: ${r.stdout}${r.stderr}`).toBe(1);
  return { status: r.status, out: JSON.parse(lines[0]!) };
}
const facts = () => JSON.parse(readFileSync(path.join(TRUTH, 'facts.json'), 'utf8'));
const storyboard = () => JSON.parse(readFileSync(path.join(TRUTH, 'storyboard.json'), 'utf8'));

describe('showreel cli: check / render / verify refuse bad input loudly (no browser started)', () => {
  it('check: an invented fact id → E_STORYBOARD naming the slot and the id', () => {
    const sb = storyboard();
    sb.beats[0].bindings.command = 'f.command.99';
    const root = host({ 'showreel/facts.json': facts(), 'showreel/storyboard.json': sb });
    try {
      const { status, out } = cli(['check'], root);
      expect(status).toBe(1);
      expect(out).toMatchObject({ ok: false, cmd: 'check', error: { code: 'E_STORYBOARD' } });
      expect(out.error.message).toContain('/beats/0/bindings/command');
      expect(out.error.message).toContain('f.command.99');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('check: literal text echoed into a slot is refused, never rendered (Rule 13)', () => {
    const sb = storyboard();
    sb.beats[0].bindings.command = 'npm run deploy --prod';
    const root = host({ 'showreel/facts.json': facts(), 'showreel/storyboard.json': sb });
    try {
      const { status, out } = cli(['check'], root);
      expect(status).toBe(1);
      expect(out.error.code).toBe('E_STORYBOARD');
      expect(out.error.message).toContain('/beats/0/bindings/command');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('render without facts → E_NO_FACTS with the exact fix command', () => {
    const root = host({ 'showreel/storyboard.json': storyboard() });
    try {
      const { status, out } = cli(['render', '--final'], root);
      expect(status).toBe(1);
      expect(out).toMatchObject({ ok: false, cmd: 'render', error: { code: 'E_NO_FACTS', fix: 'run: node .claude/showreel/cli.mjs facts' } });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('check without a storyboard → E_NO_STORYBOARD (the agent must write one first)', () => {
    const root = host({ 'showreel/facts.json': facts() });
    try {
      const { status, out } = cli(['check'], root);
      expect(status).toBe(1);
      expect(out.error.code).toBe('E_NO_STORYBOARD');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('check/render refuse a repo whose facts failed the minimum gate (D4: no film from thin facts)', () => {
    const f = facts();
    f.minimumGate = { passed: false, missing: ['route'] };
    const root = host({ 'showreel/facts.json': f, 'showreel/storyboard.json': storyboard() });
    try {
      for (const cmd of ['check', 'render']) {
        const { status, out } = cli([cmd], root);
        expect(status).toBe(1);
        expect(out.error.code).toBe('E_THIN_REPO');
        expect(out.error.message).toContain('route');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('usage errors: --draft --master, both modes, unknown flags → E_USAGE', () => {
    const root = host();
    try {
      for (const args of [['render', '--draft', '--master'], ['render', '--draft', '--final'], ['render', '--fast'], ['check', '--nope'], ['verify', 'x']]) {
        const { status, out } = cli(args, root);
        expect(status, args.join(' ')).toBe(1);
        expect(out.error.code, args.join(' ')).toBe('E_USAGE');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('verify before any render → E_NO_RENDER naming the render command', () => {
    const root = host({ 'showreel/facts.json': facts(), 'showreel/storyboard.json': storyboard() });
    try {
      const { status, out } = cli(['verify'], root);
      expect(status).toBe(1);
      expect(out.error.code).toBe('E_NO_RENDER');
      expect(out.error.fix).toContain('cli.mjs render');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('showreel render policy (M0 RULINGS — binding)', () => {
  const GPU = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)';
  const SWIFT = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';

  it('--final on a GPU: S=6, 60 fps, crf 18; --master → crf 14', () => {
    expect(renderPolicy({ mode: 'final', master: false, renderer: GPU })).toEqual({ mode: 'final', fps: 60, samples: 6, crf: 18, gpu: true, notice: null });
    expect(renderPolicy({ mode: 'final', master: true, renderer: GPU }).crf).toBe(14);
  });

  it('--draft: S=1, 30 fps, no notice (draft is S=1 everywhere)', () => {
    expect(renderPolicy({ mode: 'draft', master: false, renderer: GPU })).toEqual({ mode: 'draft', fps: 30, samples: 1, crf: 18, gpu: true, notice: null });
    expect(renderPolicy({ mode: 'draft', master: false, renderer: SWIFT })).toMatchObject({ samples: 1, fps: 30, gpu: false, notice: null });
  });

  it('GPU-less (SwiftShader) --final: S=1 @ 60 fps with the exact notice', () => {
    const p = renderPolicy({ mode: 'final', master: false, renderer: SWIFT });
    expect(p).toMatchObject({ fps: 60, samples: 1, gpu: false });
    expect(p.notice).toBe('no GPU detected — motion blur reduced (S=1)');
    expect(p.notice).toBe(GPU_NOTICE);
  });

  it('no WebGL ("none" from the engine, "no-webgl" from preflight, empty) --final: GPU-less, S=1 + the notice', () => {
    // A host without WebGL has no GPU path; S=6 there is a very slow CPU render with no warning.
    for (const renderer of ['none', 'no-webgl', '', undefined]) {
      expect(renderPolicy({ mode: 'final', master: false, renderer }), String(renderer)).toMatchObject({ samples: 1, gpu: false, notice: GPU_NOTICE });
    }
  });

  it('parseRenderArgs: default is --final; --master only with --final', () => {
    expect(parseRenderArgs([])).toEqual({ mode: 'final', master: false });
    expect(parseRenderArgs(['--draft'])).toEqual({ mode: 'draft', master: false });
    expect(parseRenderArgs(['--final', '--master'])).toEqual({ mode: 'final', master: true });
    expect(parseRenderArgs(['--master'])).toEqual({ mode: 'final', master: true });
  });

  it('capture is JPEG q0.97 and encode is libx264 High yuv420p at the policy crf/fps', () => {
    expect(JPEG_QUALITY).toBe(0.97);
    const a = encodeArgs({ out: 'v.mp4', fps: 60, crf: 18 });
    const after = (flag: string) => a[a.indexOf(flag) + 1];
    expect(after('-f')).toBe('image2pipe');
    expect(after('-c:v')).toBe('mjpeg'); // input codec (first -c:v)
    expect(a.slice(a.lastIndexOf('-c:v'), a.lastIndexOf('-c:v') + 2)).toEqual(['-c:v', 'libx264']);
    expect(after('-crf')).toBe('18');
    expect(after('-pix_fmt')).toBe('yuv420p');
    expect(after('-profile:v')).toBe('high');
    expect(after('-r')).toBe('60');
    expect(after('-movflags')).toBe('+faststart');
    expect(after('-preset')).toBe('slow');
    expect(a.at(-1)).toBe('v.mp4');
    expect(encodeArgs({ out: 'v.mp4', fps: 30, crf: 14 })).toEqual(expect.arrayContaining(['-crf', '14', '-r', '30']));
  });

  it('mux: video copied, AAC 48 kHz stereo 256k, and NEVER -shortest (D12/D13)', () => {
    const a = muxArgs({ video: 'v.mp4', wav: 's.wav', out: 'o.mp4' });
    expect(a).not.toContain('-shortest');
    const after = (flag: string) => a[a.indexOf(flag) + 1];
    expect(after('-c:v')).toBe('copy');
    expect(after('-c:a')).toBe('aac');
    expect(after('-ar')).toBe('48000');
    expect(after('-ac')).toBe('2');
    expect(after('-b:a')).toBe('256k');
    expect(a.at(-1)).toBe('o.mp4');
  });

  it('slugify: kebab-case, ASCII-folded (Vietnamese incl. đ), never empty', () => {
    expect(slugify('Acme Shop')).toBe('acme-shop');
    expect(slugify('Ứng dụng Én Nam')).toBe('ung-dung-en-nam');
    expect(slugify('Đặt bàn')).toBe('dat-ban');
    expect(slugify('inventory_api v2!')).toBe('inventory-api-v2');
    expect(slugify('✓✓')).toBe('showreel');
  });
});

describe('showreel verify: stale renders are named as stale, not as toolkit bugs (no ffmpeg/browser)', () => {
  // Agent loop: render --final → edit storyboard → check → verify. check rewrites timeline.json and
  // resolved.json at the same fps/duration; without the input hashes verify would compare the old MP4
  // against the new build and report a confusing E_VERIFY ("report a toolkit bug").
  function rendered(record: Record<string, unknown>) {
    const root = host({
      'showreel/build/timeline.json': { fps: 30, durationS: 15, frames: 450 },
      'showreel/build/resolved.json': { beats: {} },
      'showreel/x-15s.mp4': 'not a real mp4',
    });
    const rec = { version: 1, out: 'showreel/x-15s.mp4', mode: 'draft', fps: 30, durationS: 15, inputs: inputHashes(root), ...record };
    writeFileSync(path.join(root, 'showreel', 'build', 'render.json'), JSON.stringify(rec));
    return root;
  }

  it('check re-ran after render (resolved.json changed, same fps/duration) → E_STALE_RENDER naming the file + re-render fix', () => {
    const root = rendered({});
    try {
      writeFileSync(path.join(root, 'showreel', 'build', 'resolved.json'), JSON.stringify({ beats: { b1: {} } }));
      const { status, out } = cli(['verify'], root);
      expect(status).toBe(1);
      expect(out).toMatchObject({ ok: false, cmd: 'verify', error: { code: 'E_STALE_RENDER', fix: 'Re-render: node .claude/showreel/cli.mjs render --draft' } });
      expect(out.error.message).toContain('showreel/build/resolved.json');
      expect(out.error.message).not.toContain('timeline.json');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a record without input hashes, or a timeline fps that differs from the record → E_STALE_RENDER', () => {
    for (const record of [{ inputs: undefined }, { fps: 60 }]) {
      const root = rendered(record);
      try {
        const { status, out } = cli(['verify'], root);
        expect(status, JSON.stringify(record)).toBe(1);
        expect(out.error.code, JSON.stringify(record)).toBe('E_STALE_RENDER');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
});

describe('showreel verify: undrawn() — the coverage half of D8', () => {
  // manifest ⊆ resolved alone passes an engine that draws nothing (or skips a slot); undrawn() is the
  // check that every resolved item — and every count fact's unit label — actually reached the screen.
  const resolved = {
    beats: {
      b1: { slots: { title: { items: [{ id: 'f.app.name.1', text: 'Acme' }] } } },
      b2: { slots: { stats: { items: [{ id: 'f.count.routes', text: '12', number: 12, unit: 'routes' }, { id: 'p.tagline', text: 'Ship it' }] } } },
    },
  };
  const full = [
    { text: 'Acme', source: 'f.app.name.1', onScreen: true },
    { text: '12', source: 'counter:f.count.routes', onScreen: true },
    { text: '12', source: 'f.count.routes', onScreen: true },
    { text: 'routes', source: 'unit:f.count.routes', onScreen: true },
    { text: 'Ship it', source: 'p.tagline', onScreen: true },
  ];

  it('a manifest covering every item and unit → []', () => {
    expect(undrawn(full, resolved)).toEqual([]);
  });

  it('an entry that never reached a frame (text drawn into a sprite that was never placed) is NOT coverage', () => {
    // the engine records sprite text at layout boot, before any frame: presence alone would pass a title
    // sprite that draw() never blits (engine/text.mjs onScreen)
    const sprite = full.map((m) => (m.source === 'f.app.name.1' ? { ...m, onScreen: false } : m));
    expect(undrawn(sprite, resolved)).toEqual(['b1.title f.app.name.1']);
    // an old-format entry without the flag cannot prove coverage either
    const legacy = full.map((m) => (m.source === 'p.tagline' ? { text: m.text, source: m.source } : m));
    expect(undrawn(legacy as never, resolved)).toEqual(['b2.stats p.tagline']);
  });

  it('a resolved item the engine never drew is listed with beat.slot', () => {
    expect(undrawn(full.filter((m) => m.source !== 'p.tagline'), resolved)).toEqual(['b2.stats p.tagline']);
  });

  it('a count fact whose unit label was never drawn is listed as unit:<factId>', () => {
    expect(undrawn(full.filter((m) => m.source !== 'unit:f.count.routes'), resolved)).toEqual(['b2.stats unit:f.count.routes']);
  });

  it('an empty manifest lists every item (an engine that draws nothing cannot pass)', () => {
    expect(undrawn([], resolved)).toEqual(['b1.title f.app.name.1', 'b2.stats f.count.routes', 'b2.stats unit:f.count.routes', 'b2.stats p.tagline']);
  });
});

describe('showreel render/verify helpers', () => {
  const frame = 1 / ENGINE_TL.fps;
  const onGrid = (t: number) => Math.abs(t * ENGINE_TL.fps - Math.round(t * ENGINE_TL.fps)) < 1e-6;

  it('determinismPoints: beat-1 mid, the overlap nearest mid-film, last-beat mid — on the frame grid', () => {
    const pts = determinismPoints(ENGINE_TL);
    expect(pts.map((p: { label: string }) => p.label)).toEqual(['beat1-mid', 'middle-overlap', 'last-beat-mid']);
    for (const p of pts) expect(onGrid(p.t), String(p.t)).toBe(true);
    const [b1, ov, last] = pts;
    const B = ENGINE_TL.beats;
    expect(b1.t).toBeGreaterThan(B[0].t0);
    expect(b1.t).toBeLessThan(B[0].t1);
    expect(last.t).toBeGreaterThan(B.at(-1).t0);
    // the overlap point is inside a real zoom-through overlap (2 beats on screen)
    const inOverlap = B.some((b: any, i: number) => i < B.length - 1 && b.overlapOut > 0 && ov.t >= B[i + 1].t0 - frame / 2 && ov.t <= b.t1 + frame / 2);
    expect(inOverlap).toBe(true);
  });

  it('determinismPoints: an all-cut film still yields 3 distinct points', () => {
    const tl = structuredClone(ENGINE_TL);
    let t = 0;
    for (const b of tl.beats) { const d = b.t1 - b.t0 - b.overlapIn - b.overlapOut; b.t0 = t; b.t1 = t + d; b.overlapIn = 0; b.overlapOut = 0; b.transitionOut = 'cut'; t += d; }
    const pts = determinismPoints(tl);
    expect(new Set(pts.map((p: { t: number }) => p.t)).size).toBe(3);
  });

  it('sheetTimes (C17): 3 labelled stills per beat (enter/hold/exit), inside the beat solo window, on the frame grid; sheet = 4-column tile', () => {
    const st = sheetTimes(ENGINE_TL);
    expect(st.length).toBe(3 * ENGINE_TL.beats.length);
    for (const b of ENGINE_TL.beats) {
      const mine = st.filter((s: any) => s.beatId === b.id);
      expect(mine.map((s: any) => s.still)).toEqual(['enter', 'hold', 'exit']);
      // ordered in time and inside the part of the beat that is alone on screen (a transition still would
      // show two beats under one label)
      expect(mine[0].t).toBeLessThan(mine[1].t);
      expect(mine[1].t).toBeLessThan(mine[2].t);
      for (const s of mine) {
        expect(s.t).toBeGreaterThanOrEqual(b.t0 + b.overlapIn);
        expect(s.t).toBeLessThan(b.t1 - b.overlapOut);
        expect(onGrid(s.t)).toBe(true);
        // label = beat id, archetype/variant, still, LOCAL t (seconds since the beat's t0)
        expect(s.label).toBe(`${b.id}  ${b.archetype}/${b.variant}  ${s.still}  t=${(s.t - b.t0).toFixed(2)}s`);
      }
    }
    const a = sheetArgs({ out: 'sheet.png', count: 3 * 8 });
    expect(a.join(' ')).toContain('tile=4x6');
  });

  it('parseFrameCount reads the FINAL frame= of ffmpeg stats (progress lines use \\r)', () => {
    const stderr = 'Stream mapping:\r\nframe=  600 fps=0.0 q=-0.0 size=N/A\rframe= 1200 fps=0.0 q=-0.0\rframe= 1800 fps=900 q=-0.0 Lsize=N/A time=00:00:29.98\n';
    expect(parseFrameCount(stderr)).toBe(1800);
    expect(parseFrameCount('no stats here')).toBeNull();
  });

  it('parseStreams reads codec/profile/pix_fmt/size/fps and AAC rate/layout from ffmpeg -i output', () => {
    const s = parseStreams(
      '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, progressive), 1920x1080, 9000 kb/s, 60 fps, 60 tbr, 15360 tbn (default)\n' +
      '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 256 kb/s (default)\n',
    );
    expect(s).toEqual({ video: { codec: 'h264', profile: 'High', pixFmt: 'yuv420p', width: 1920, height: 1080, fps: 60 }, audio: { codec: 'aac', rate: 48000, layout: 'stereo' } });
  });

  it('streamsOk (D13 format gate) rejects each wrong field: profile, pix_fmt, size, fps, audio rate/layout, missing stream', () => {
    // verify is the only gate on the delivered format; a predicate that is always true would pass every e2e.
    const banner = (v: string, a: string) => parseStreams(`  Stream #0:0[0x1](und): Video: ${v}\n  Stream #0:1[0x2](und): Audio: ${a}\n`);
    const V = 'h264 (High) (avc1 / 0x31637661), yuv420p(tv, progressive), 1920x1080, 9000 kb/s, 60 fps, 60 tbr';
    const A = 'aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 256 kb/s';
    expect(streamsOk(banner(V, A), 60)).toBe(true);
    expect(streamsOk(banner(V, A), 30)).toBe(false); // fps differs from the render record
    expect(streamsOk(banner(V.replace('(High)', '(Main)'), A), 60)).toBe(false);
    expect(streamsOk(banner(V.replace('yuv420p(', 'yuv444p('), A), 60)).toBe(false);
    expect(streamsOk(banner(V.replace('1920x1080', '1280x720'), A), 60)).toBe(false);
    expect(streamsOk(banner(V, A.replace('48000 Hz', '44100 Hz')), 60)).toBe(false);
    expect(streamsOk(banner(V, A.replace('stereo', 'mono')), 60)).toBe(false);
    expect(streamsOk({ video: parseStreams(`  Stream #0:0[0x1](und): Video: ${V}\n`).video, audio: null }, 60)).toBe(false);
  });

  it('a --draft (30 fps) timeline passes AC4 analyze: the onset search must not widen with the frame (found by e2e)', async () => {
    // Python fixture, 15 s, the e2e helper storyboard, compiled at the DRAFT fps. With a ±3-frame search
    // (±100 ms at 30 fps) the analyzer picked a louder bed onset 81 ms before the `snap` hit and failed a
    // score whose snap is in sync (ablation: the snap adds +11 dB at its own t). Same film at 60 fps passed.
    const K = '../../templates/showreel/.claude/showreel/';
    const { extractFacts } = await import(K + 'lib/facts/extract.mjs');
    const { resolve } = await import(K + 'lib/truth/resolve.mjs');
    const { compileTimeline } = await import(K + 'lib/compile/timeline.mjs');
    const { renderScore } = await import(K + 'lib/score/make.mjs');
    const { analyzeScore } = await import(K + 'lib/score/analyze.mjs');
    const { makeStoryboard } = await import('./helpers/storyboard');
    const T = path.resolve(HERE, K);
    const archetypes = JSON.parse(readFileSync(path.join(T, 'archetypes', 'archetypes.json'), 'utf8'));
    const phrases = JSON.parse(readFileSync(path.join(T, 'phrases.json'), 'utf8'));
    const { facts: f } = await extractFacts(path.join(HERE, 'fixtures', 'facts', 'python-fastapi'));
    const sb = makeStoryboard(f.facts, 15);
    const resolved = resolve(sb, { archetypes, facts: f, phrases });
    for (const fps of [30, 60]) {
      const tl = compileTimeline(sb, resolved, archetypes, { fps });
      const an = analyzeScore(renderScore(tl), tl);
      expect(an.hits.filter((h: { ok: boolean }) => !h.ok), `fps ${fps}`).toEqual([]);
      expect(an.ok, `fps ${fps}`).toBe(true);
    }
  }, 60_000);

  it('decodeWav round-trips the score WAV (analyze runs on exactly what was muxed)', () => {
    const n = 4800;
    const left = new Float32Array(n), right = new Float32Array(n);
    for (let i = 0; i < n; i++) { left[i] = Math.sin(i / 10) * 0.5; right[i] = -left[i]!; }
    const back = decodeWav(encodeWav({ left, right, sampleRate: 48000 }));
    expect(back.sampleRate).toBe(48000);
    expect(back.left.length).toBe(n);
    expect(Math.abs(back.left[123]! - left[123]!)).toBeLessThan(1 / 32767 + 1e-6);
    expect(Math.abs(back.right[4000]! - right[4000]!)).toBeLessThan(1 / 32767 + 1e-6);
  });
});

// Orchestrator ruling (M1): a quick --draft must never overwrite a verified --final film.
describe('output names', () => {
  it('draft and final of the same duration write different files', () => {
    const p = showreelPaths('/host');
    expect(p.out('acme-shop', 30)).toBe('showreel/acme-shop-30s.mp4');
    expect(p.out('acme-shop', 30, { draft: true })).toBe('showreel/acme-shop-30s-draft.mp4');
  });
});

// Review fixes (M1 PR review): the browser session and the deliverable must fail loud and safe.
describe('browser session: a close() failure never hides the real error (Rule 12)', () => {
  const closing = (err: Error | null) => ({ closed: 0, async close() { this.closed++; if (err) throw err; } });
  const leak = () => new ShowreelError('E_BROWSER', 'Browser processes still hold C:/tmp/profile after close: msedge.exe#42.', 'fix');

  it('work failed AND close failed → the work error is thrown, with the close failure appended', async () => {
    const s = closing(leak());
    const err = await useSession(s, async () => { throw new ShowreelError('E_TEXT_FIT', 'beat b2 slot command does not fit at 22 px', 'shorten'); }).catch((e) => e);
    expect(s.closed).toBe(1);
    expect(err.code).toBe('E_TEXT_FIT');
    expect(err.message).toContain('beat b2 slot command does not fit');
    expect(err.message).toContain('closing the browser also failed: Browser processes still hold');
  });

  it('work succeeded, close failed → the close error is thrown (a leaked browser is never silent)', async () => {
    const err = await useSession(closing(leak()), async () => 'done').catch((e) => e);
    expect(err.code).toBe('E_BROWSER');
  });

  it('close ok → the work result / the untouched work error', async () => {
    expect(await useSession(closing(null), async () => 7)).toBe(7);
    const boom = new ShowreelError('E_GLYPH', 'no glyph for "ệ"', 'fix');
    await expect(useSession(closing(null), async () => { throw boom; })).rejects.toBe(boom);
    expect(boom.message).toBe('no glyph for "ệ"');
  });

  it('check, render and verify all close their session through useSession (no bare close() in finally)', async () => {
    const toolkit = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
    const users = (await fg('lib/**/*.mjs', { cwd: toolkit })).filter((f) => /await openSession\(hostRoot\)/.test(readFileSync(path.join(toolkit, f), 'utf8'))).sort();
    expect(users).toEqual(['lib/check/cmd.mjs', 'lib/render/cmd.mjs', 'lib/verify/run.mjs']);
    for (const f of users) {
      const src = readFileSync(path.join(toolkit, f), 'utf8');
      expect(src, f).toMatch(/useSession\(await openSession\(hostRoot\)/);
      expect(src, f).not.toMatch(/session\.close\(\)/);
    }
  });
});

describe('engine boot: a module that never sets window.SHOWREEL is E_ENGINE with the page errors, not a bare timeout', () => {
  const page = (o: { wait?: () => Promise<unknown>; ready?: () => Promise<unknown> }) => {
    const calls: unknown[] = [];
    return {
      calls,
      async goto(url: string) { calls.push(['goto', url]); },
      async waitForFunction(fn: string, opts: unknown) { calls.push(['wait', fn, opts]); return o.wait ? o.wait() : true; },
      async evaluate() { return o.ready ? o.ready() : true; },
    };
  };
  const timeout = () => Promise.reject(Object.assign(new Error('Waiting failed: 30000ms exceeded'), { name: 'TimeoutError' }));

  it('boot timeout → E_ENGINE naming the timeout and every page/console error collected', async () => {
    const p = page({ wait: timeout });
    const err = await bootEngine(p, 'http://x/engine/page.html', ["SyntaxError: Unexpected token '}' (archetypes/lockup-cta.mjs)"], ['Failed to load resource: 404 /archetypes/kinetic-text.mjs']).catch((e) => e);
    expect(err).toBeInstanceOf(ShowreelError);
    expect(err.code).toBe('E_ENGINE');
    expect(err.message).toContain(`never appeared within ${ENGINE_BOOT_MS} ms`);
    expect(err.message).toContain('archetypes/lockup-cta.mjs');
    expect(err.message).toContain('kinetic-text.mjs');
    expect(p.calls[1]).toEqual(['wait', 'window.SHOWREEL && window.SHOWREEL.ready', { timeout: ENGINE_BOOT_MS }]);
  });

  it('SHOWREEL.ready rejected → E_ENGINE with the rejection and page errors', async () => {
    const err = await bootEngine(page({ ready: () => Promise.reject(new Error('fonts failed')) }), 'u', ['TypeError: x']).catch((e) => e);
    expect(err.code).toBe('E_ENGINE');
    expect(err.message).toContain('fonts failed');
    expect(err.message).toContain('TypeError: x');
  });
});

describe('render publishes the film only after verify passes (a failed verify never replaces a verified final)', () => {
  const OUT = 'showreel/acme-shop-15s.mp4';
  const RECORD = { version: 1, out: OUT, mode: 'final', fps: 60 };
  const readRecord = (root: string) => JSON.parse(readFileSync(path.join(root, 'showreel', 'build', 'render.json'), 'utf8'));

  it('the unverified film lives in build/', () => {
    expect(unverifiedPath('/host', OUT)).toBe('showreel/build/acme-shop-15s.unverified.mp4');
    expect(unverifiedPath('/host', 'showreel/acme-shop-15s-draft.mp4')).toBe('showreel/build/acme-shop-15s-draft.unverified.mp4');
  });

  it('verify fails → previous final untouched, failed film kept in build/, record points at the failed film', async () => {
    const tmp = unverifiedPath('/host', OUT);
    const root = host({ [OUT]: 'OLD VERIFIED FILM', [tmp]: 'NEW TRUNCATED FILM' });
    try {
      let seen: string | undefined;
      const res = await verifyAndPublish(root, { tmp, out: OUT, record: RECORD }, async (r: string) => {
        seen = readRecord(r).out;
        return { data: {}, failed: ['videoFrames 840 != 900'] };
      });
      expect(seen).toBe(tmp); // verify checked the NEW film, not the old deliverable
      expect(res.failed).toEqual(['videoFrames 840 != 900']);
      expect(readFileSync(path.join(root, OUT), 'utf8')).toBe('OLD VERIFIED FILM');
      expect(readFileSync(path.join(root, tmp), 'utf8')).toBe('NEW TRUNCATED FILM');
      expect(readRecord(root).out).toBe(tmp); // a later `verify` re-checks the failed film, never the old one
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('verify passes → the film is moved onto the deliverable and the record points at it', async () => {
    const tmp = unverifiedPath('/host', OUT);
    const root = host({ [OUT]: 'OLD VERIFIED FILM', [tmp]: 'NEW GOOD FILM' });
    try {
      const res = await verifyAndPublish(root, { tmp, out: OUT, record: RECORD }, async () => ({ data: {}, failed: [] }));
      expect(res.failed).toEqual([]);
      expect(readFileSync(path.join(root, OUT), 'utf8')).toBe('NEW GOOD FILM');
      expect(existsSync(path.join(root, tmp))).toBe(false);
      expect(readRecord(root)).toEqual(RECORD);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // A verified film that cannot be published (old film locked by a player on Windows) must say where
  // the verified film is — not surface as a raw fs error. A non-empty directory at `out` makes the
  // rename fail portably.
  it('verify passes but the move fails → E_PUBLISH naming both paths; the verified film is kept', async () => {
    const tmp = unverifiedPath('/host', OUT);
    const root = host({ [`${OUT}/locked`]: 'x', [tmp]: 'NEW GOOD FILM' });
    try {
      const err = await verifyAndPublish(root, { tmp, out: OUT, record: RECORD }, async () => ({ data: {}, failed: [] }))
        .then(() => null, (e: unknown) => e as ShowreelError);
      expect(err).toBeInstanceOf(ShowreelError);
      expect(err!.code).toBe('E_PUBLISH');
      expect(err!.message).toContain(OUT);
      expect(err!.message).toContain(tmp);
      expect(readFileSync(path.join(root, tmp), 'utf8')).toBe('NEW GOOD FILM');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
