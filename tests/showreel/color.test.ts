import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeArgs, startEncoder, COLOR_FILTER, JPEG_QUALITY } from '../../templates/showreel/.claude/showreel/render/encode.mjs';
import { parseStreams, parseColor, probeVideo } from '../../templates/showreel/.claude/showreel/render/verify.mjs';
import { colorTagsFailure, streamsOk } from '../../templates/showreel/.claude/showreel/lib/verify/run.mjs';
import { resolveFfmpeg, runFfmpeg, startPipe } from '../../templates/showreel/.claude/showreel/lib/render/ffmpeg.mjs';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';

// v1.16 showreel M2 — BT.709 output (CTO overrule). Canvas JPEG frames are JFIF = FULL-range BT.601 YCbCr;
// HD players decode H.264 with the BT.709 matrix unless told otherwise. The M1 film was converted with the
// BT.601 matrix and tagged bt470bg, so brand colours shifted in some players. The fix has two halves that
// must agree: the encode CONVERTS to limited-range BT.709 and TAGS the stream bt709; verify asserts the tags.
// The round-trip test proves the conversion matches the tag (and that it can fail: the M1 path is measurably off).

const BANNER = (pix: string) =>
  `  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), ${pix}, 1920x1080 [SAR 1:1 DAR 16:9], 9000 kb/s, 60 fps, 60 tbr, 15360 tbn (default)\n` +
  '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 256 kb/s (default)\n';

describe('BT.709 encode args (exact filter + 4 tags)', () => {
  const a = encodeArgs({ out: 'v.mp4', fps: 60, crf: 18 });
  const after = (flag: string) => a[a.indexOf(flag) + 1];

  it('converts full-range BT.601 (JPEG) → limited-range BT.709 with the exact scale filter', () => {
    expect(COLOR_FILTER).toBe('scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=tv');
    expect(after('-vf')).toBe(COLOR_FILTER);
    expect(a.filter((x) => x === '-vf' || x === '-filter:v' || x === '-filter_complex')).toHaveLength(1);
  });

  it('tags colorspace/primaries/trc bt709 and range tv, as OUTPUT options (after the input, before the file)', () => {
    expect(after('-colorspace')).toBe('bt709');
    expect(after('-color_primaries')).toBe('bt709');
    expect(after('-color_trc')).toBe('bt709');
    expect(after('-color_range')).toBe('tv');
    const input = a.indexOf('-i');
    for (const f of ['-vf', '-colorspace', '-color_primaries', '-color_trc', '-color_range']) {
      expect(a.indexOf(f), f).toBeGreaterThan(input);
      expect(a.indexOf(f), f).toBeLessThan(a.length - 1);
    }
  });
});

describe('verify colorTags (banner parse)', () => {
  it('parseStreams still reads the full format from a bt709-tagged banner (3-item pix_fmt parenthetical)', () => {
    expect(parseStreams(BANNER('yuv420p(tv, bt709, progressive)'))).toEqual({
      video: { codec: 'h264', profile: 'High', pixFmt: 'yuv420p', width: 1920, height: 1080, fps: 60 },
      audio: { codec: 'aac', rate: 48000, layout: 'stereo' },
    });
    expect(streamsOk(parseStreams(BANNER('yuv420p(tv, bt709, progressive)')), 60)).toBe(true);
  });

  it('parseColor: one name = all three tags; a/b/c = space/primaries/trc; untagged = nulls', () => {
    expect(parseColor(BANNER('yuv420p(tv, bt709, progressive)'))).toEqual({ range: 'tv', space: 'bt709', primaries: 'bt709', trc: 'bt709' });
    expect(parseColor(BANNER('yuv420p(tv, bt470bg/unknown/unknown, progressive)'))).toEqual({ range: 'tv', space: 'bt470bg', primaries: 'unknown', trc: 'unknown' });
    expect(parseColor(BANNER('yuv420p(tv, bt709/bt709/smpte170m, progressive)'))).toEqual({ range: 'tv', space: 'bt709', primaries: 'bt709', trc: 'smpte170m' });
    expect(parseColor(BANNER('yuv420p(progressive)'))).toEqual({ range: null, space: null, primaries: null, trc: null });
    expect(parseColor(BANNER('yuv420p(pc, bt709, top coded first (swapped))'))).toEqual({ range: 'pc', space: 'bt709', primaries: 'bt709', trc: 'bt709' });
    expect(parseColor('  Stream #0:0: Audio: aac, 48000 Hz, stereo\n')).toBeNull();
  });

  it('colorTagsFailure passes only tv + bt709×3 and names `colorTags` otherwise (the M1 bt470bg film fails)', () => {
    expect(colorTagsFailure(parseColor(BANNER('yuv420p(tv, bt709, progressive)')))).toBeNull();
    for (const pix of [
      'yuv420p(tv, bt470bg/unknown/unknown, progressive)', // M1 output
      'yuv420p(tv, bt470bg, progressive)',
      'yuv420p(tv, bt709/bt709/bt470bg, progressive)', // one tag wrong
      'yuv420p(pc, bt709, progressive)', // full range: players would stretch levels
      'yuv420p(progressive)', // untagged
    ]) {
      const f = colorTagsFailure(parseColor(BANNER(pix)));
      expect(f, pix).toMatch(/^colorTags /);
    }
    expect(colorTagsFailure(null)).toMatch(/^colorTags /);
  });
});

// runVerify itself must turn a wrong-tagged film into E_VERIFY. Testing only colorTagsFailure() would
// still pass if runVerify stopped calling it, and a bt470bg film would then ship as verified. ffmpeg, the
// browser session, the score analysis and the manifest check are stubbed with vi.doMock, so the only
// difference between the two runs below is the probed colour tags.
describe('runVerify rejects a film whose colour tags are not BT.709 (E_VERIFY naming colorTags)', () => {
  const R = '../../templates/showreel/.claude/showreel/';
  const TAGS_709 = { range: 'tv', space: 'bt709', primaries: 'bt709', trc: 'bt709' };
  const TAGS_M1 = { range: 'tv', space: 'bt470bg', primaries: 'unknown', trc: 'unknown' }; // what M1 shipped
  const STREAMS = parseStreams(BANNER('yuv420p(tv, bt709, progressive)'));
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), 'showreel-verify-color-'));
    const b = path.join(root, 'showreel', 'build');
    mkdirSync(b, { recursive: true });
    const j = (f: string, v: unknown) => writeFileSync(path.join(b, f), JSON.stringify(v));
    j('timeline.json', { fps: 60, durationS: 1, frames: 60 });
    j('resolved.json', { beats: {} });
    j('manifest.json', [{ text: 'x', source: 'f1' }]);
    j('determinism.json', { samples: 6, renderer: 'stub', points: ['a', 'b', 'c'].map((label, i) => ({ label, t: i * 0.3, sha256: 'h' })) });
    writeFileSync(path.join(b, 'score.wav'), Buffer.alloc(4));
    writeFileSync(path.join(b, 'video.mp4'), Buffer.alloc(4));
    const { inputHashes } = await import('../../templates/showreel/.claude/showreel/lib/verify/run.mjs');
    j('render.json', { out: 'showreel/build/video.mp4', mode: 'final', fps: 60, durationS: 1, inputs: inputHashes(root) });
  });
  afterAll(() => {
    vi.resetModules();
    vi.doUnmock(R + 'render/verify.mjs');
    vi.doUnmock(R + 'lib/render/ffmpeg.mjs');
    vi.doUnmock(R + 'lib/render/session.mjs');
    vi.doUnmock(R + 'render/frames.mjs');
    vi.doUnmock(R + 'lib/score/analyze.mjs');
    vi.doUnmock(R + 'lib/truth/manifest.mjs');
    if (root) rmSync(root, { recursive: true, force: true });
  });

  /** run `cli.mjs verify` (lib/verify/cmd.mjs) with every external probe stubbed except the colour tags */
  async function verifyWith(color: unknown) {
    vi.resetModules();
    vi.doMock(R + 'render/verify.mjs', async (orig) => ({
      ...(await orig<object>()),
      probeVideo: async () => ({ frames: 60, streams: STREAMS, color }),
      countAudioSamples: async () => 48000,
      decodeWav: () => ({ sampleRate: 48000, channels: [] }),
    }));
    vi.doMock(R + 'lib/render/ffmpeg.mjs', async (orig) => ({ ...(await orig<object>()), resolveFfmpeg: () => 'ffmpeg-stub' }));
    vi.doMock(R + 'lib/render/session.mjs', async (orig) => ({
      ...(await orig<object>()),
      openSession: async () => ({ page: async () => ({ page: {}, renderer: 'stub' }), close: async () => {} }),
    }));
    vi.doMock(R + 'render/frames.mjs', async (orig) => ({ ...(await orig<object>()), hashAt: async () => 'h' }));
    vi.doMock(R + 'lib/score/analyze.mjs', async (orig) => ({
      ...(await orig<object>()),
      analyzeScore: () => ({ ok: true, hits: [], peakDbfs: -3, samples: 48000, clipped: 0, nan: 0 }),
    }));
    vi.doMock(R + 'lib/truth/manifest.mjs', async (orig) => ({ ...(await orig<object>()), checkManifest: () => [] }));
    const { run } = await import('../../templates/showreel/.claude/showreel/lib/verify/cmd.mjs');
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => { lines.push(String(s)); return true; });
    try {
      const status = await run([], root);
      return { status, out: JSON.parse(lines.join('').trim()) };
    } finally {
      spy.mockRestore();
    }
  }

  it('positive control: the same stubbed film tagged tv + bt709×3 verifies ok (so the stubs alone pass every check)', async () => {
    const { status, out } = await verifyWith(TAGS_709);
    expect(out).toMatchObject({ ok: true, cmd: 'verify', colorTagsOk: true, colorTags: TAGS_709 });
    expect(status).toBe(0);
  });

  it('a bt470bg-tagged film (the M1 output) → E_VERIFY whose only failed check starts with colorTags', async () => {
    const { status, out } = await verifyWith(TAGS_M1);
    expect(status).toBe(1);
    expect(out).toMatchObject({ ok: false, cmd: 'verify', error: { code: 'E_VERIFY' } });
    expect(out.error.message).toMatch(/^1 check\(s\) failed for showreel\/build\/video\.mp4: colorTags /);
    expect(out.error.message).toContain('bt470bg');
  });
});

// ── gated round trip (SHOWREEL_E2E=1): browser JPEG → encode → decode with the BT.709 matrix ──
const E2E = process.env.SHOWREEL_E2E === '1';
const BROWSER_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];
const W = 320, H = 180, FRAMES = 6;

// sRGB → CIE Lab (D65), ΔE76 = Euclidean distance in Lab
function lab([r, g, b]: number[]) {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r!), G = lin(g!), B = lin(b!);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const deltaE76 = (a: number[], b: number[]) => { const A = lab(a), B = lab(b); return Math.hypot(A[0]! - B[0]!, A[1]! - B[1]!, A[2]! - B[2]!); };
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

describe('deltaE76 helper (the oracle itself)', () => {
  it('is 0 for equal colours and grows with the error', () => {
    expect(deltaE76([139, 107, 255], [139, 107, 255])).toBe(0);
    expect(deltaE76([139, 107, 255], [139, 118, 255])).toBeGreaterThan(3); // the M1 green shift measured on #8b6bff
    expect(deltaE76([139, 107, 255], [138, 107, 254])).toBeLessThan(1);
  });
});

describe.skipIf(!E2E)('BT.709 colour round trip (SHOWREEL_E2E=1)', () => {
  let ffmpeg: string;
  let browser: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let dir: string;

  // M1's encode (no conversion, no tags) — the path this milestone replaces; kept here only as the negative control
  const m1Args = (out: string) => [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', '60', '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '60', out,
  ];

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    ffmpeg = resolveFfmpeg(process.cwd());
    const exe = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, ...BROWSER_CANDIDATES].find((p) => p && existsSync(p));
    if (!exe) throw new Error('no Chrome found: set SHOWREEL_BROWSER=/path/to/chrome');
    const mod = await loadDep('puppeteer-core', process.cwd());
    const puppeteer = mod.default ?? mod;
    browser = await puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs() });
    dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-color-'));
  });
  afterAll(async () => {
    await browser?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  /** a solid-colour frame JPEG-encoded by the browser canvas exactly like render/frames.mjs captures */
  async function canvasJpeg(hex: string): Promise<Buffer> {
    const page = await browser.newPage();
    try {
      const url: string = await page.evaluate((hex: string, w: number, h: number, q: number) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d')!;
        g.fillStyle = hex; g.fillRect(0, 0, w, h);
        return c.toDataURL('image/jpeg', q);
      }, hex, W, H, JPEG_QUALITY);
      return Buffer.from(url.slice('data:image/jpeg;base64,'.length), 'base64');
    } finally {
      await page.close();
    }
  }

  async function encodeWith(args: string[] | null, jpeg: Buffer, out: string) {
    const enc = args
      ? startPipe(ffmpeg, args, { what: 'm1 encode' })
      : startEncoder({ ffmpeg, out, fps: 60, crf: 18 });
    for (let i = 0; i < FRAMES; i++) await enc.write(jpeg);
    await enc.end();
  }

  /** decode frame 0 to RGB with the BT.709 limited-range matrix (what an HD player assumes / the tag declares); centre pixel */
  async function decode709(file: string): Promise<number[]> {
    const raw = path.join(dir, path.basename(file) + '.rgb');
    await runFfmpeg(ffmpeg, ['-y', '-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'scale=in_color_matrix=bt709:in_range=tv,format=rgb24', '-f', 'rawvideo', raw], { what: 'decode' });
    const buf = readFileSync(raw);
    expect(buf.length).toBe(W * H * 3);
    const o = ((H / 2) * W + W / 2) * 3;
    return [buf[o]!, buf[o + 1]!, buf[o + 2]!];
  }

  for (const hex of ['#8b6bff', '#2ee6d6']) {
    it(`${hex}: the shipped encode round-trips within ΔE76 ≤ 3 and is tagged bt709; the M1 path is visibly off`, async () => {
      const target = hexRgb(hex);
      const jpeg = await canvasJpeg(hex);
      const name = hex.slice(1);

      const now = path.join(dir, `${name}-709.mp4`);
      await encodeWith(null, jpeg, now);
      const probed = await probeVideo(ffmpeg, now);
      expect(probed.frames).toBe(FRAMES);
      expect(probed.color).toEqual({ range: 'tv', space: 'bt709', primaries: 'bt709', trc: 'bt709' }); // real ffmpeg banner
      expect(colorTagsFailure(probed.color)).toBeNull();
      const got = await decode709(now);
      const dNow = deltaE76(target, got);
      expect(dNow, `decoded ${got} vs ${target}`).toBeLessThanOrEqual(3);

      const old = path.join(dir, `${name}-m1.mp4`);
      await encodeWith(m1Args(old), jpeg, old);
      const oldProbe = await probeVideo(ffmpeg, old);
      expect(colorTagsFailure(oldProbe.color)).toMatch(/^colorTags /); // verify would reject the M1 film
      const dOld = deltaE76(target, await decode709(old));
      // discrimination: the BT.601-converted stream decoded as BT.709 is clearly worse than the threshold
      expect(dOld).toBeGreaterThan(3);
      expect(dOld).toBeGreaterThan(dNow * 2);
    });
  }
});
