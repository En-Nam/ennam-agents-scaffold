import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ShowreelError } from '../../templates/showreel/.claude/showreel/lib/util/out.mjs';
import {
  preflightPlan,
  detectBrowser,
  launchArgs,
  kindOfPath,
  GPU_NOTICE,
} from '../../templates/showreel/.claude/showreel/lib/preflight/plan.mjs';
import { run } from '../../templates/showreel/.claude/showreel/lib/preflight/cmd.mjs';
import { realProbe, runGpuProbe } from '../../templates/showreel/.claude/showreel/lib/preflight/probe.mjs';
import {
  launchBrowser,
  launchWith,
  usesConnectPath,
  listProfileProcesses,
} from '../../templates/showreel/.claude/showreel/render/browser.mjs';

// v1.16 showreel — preflight (AC8 / Review Focus 5). Preflight is the user's first contact
// with the toolkit: on a host with Edge only, no browser, no ffmpeg or an old Node it must
// stop with an actionable message naming the env var to set — never fail later mid-render,
// and never touch the host's own package.json. All probes are mocked except the
// SHOWREEL_E2E=1 block, which launches the real browsers on this machine.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const HOST = join('/host');
const TOOLKIT = join(HOST, '.claude/showreel');
const TOOL = join(TOOLKIT, '.tool');
const LOCK = '{"lockfileVersion":3}\n';

const WIN_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const WIN_EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const WIN_ENV = {
  PROGRAMFILES: 'C:\\Program Files',
  'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local',
};
const FFMPEG_STATIC = join(TOOL, 'node_modules/ffmpeg-static/ffmpeg.exe');
const GPU = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)';
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';

type Run = { cmd: string; args: string[]; cwd?: string };
type ProbeOpts = {
  platform?: string;
  uid?: number | null;
  nodeVersion?: string;
  expectVersion?: string | null;
  env?: Record<string, string>;
  files?: Record<string, string>;
  which?: Record<string, string>;
  runs?: (r: Run, files: Map<string, string>) => { status: number; stdout?: string; stderr?: string };
  ffmpegStatic?: string | null;
  renderer?: string | { error: string };
};

/** Healthy Windows host: deps installed and matching, ffmpeg-static present, Chrome installed. */
function makeProbe(o: ProbeOpts = {}) {
  const files = new Map<string, string>(
    Object.entries({
      [join(TOOLKIT, 'deps/manifest.json')]: '{"name":"showreel-tool"}\n',
      [join(TOOLKIT, 'deps/lock.json')]: LOCK,
      [join(TOOL, 'package-lock.json')]: LOCK,
      [join(TOOL, 'node_modules/.package-lock.json')]: '{}',
      [FFMPEG_STATIC]: 'bin',
      [WIN_CHROME]: 'bin',
      ...(o.files ?? {}),
    }).filter(([, v]) => v !== undefined && v !== null),
  );
  const writes: string[] = [];
  const runs: Run[] = [];
  const env = { ...WIN_ENV, ...(o.env ?? {}) };
  const probe = {
    platform: o.platform ?? 'win32',
    uid: o.uid === undefined ? null : o.uid,
    nodeVersion: o.nodeVersion ?? '22.12.0',
    execPath: 'node',
    toolkitVersion: '1.0.0',
    expectVersion: o.expectVersion ?? null,
    hostRoot: HOST,
    toolkitDir: TOOLKIT,
    toolDir: TOOL,
    env: (name: string) => env[name as keyof typeof env],
    exists: (p: string) => files.has(p),
    fileHash: (p: string) => (files.has(p) ? `h:${files.get(p)}` : null),
    writeFile: (p: string, text: string) => { writes.push(p); files.set(p, text); },
    copyFile: (src: string, dst: string) => { writes.push(dst); files.set(dst, files.get(src) ?? ''); },
    which: (name: string) => o.which?.[name] ?? null,
    run: (cmd: string, args: string[], opts: { cwd?: string } = {}) => {
      const r = { cmd, args, cwd: opts.cwd };
      runs.push(r);
      return { stdout: '', stderr: '', ...(o.runs ? o.runs(r, files) : { status: 0 }) };
    },
    ffmpegStaticPath: () => (o.ffmpegStatic === undefined ? FFMPEG_STATIC : o.ffmpegStatic),
    gpuRenderer: () => {
      const r = o.renderer ?? GPU;
      return typeof r === 'string' ? { renderer: r } : r;
    },
  };
  return { probe, files, writes, runs };
}

const codes = (plan: { errors: { code: string }[] }) => plan.errors.map((e) => e.code);

describe('preflight plan — Node floor and version handshake', () => {
  it('Node 20.11 → E_NODE with an actionable fix, and nothing is written or installed', () => {
    // An old Node must be refused before any side effect: a half-run npm ci would leave
    // a .tool dir the next (correct) Node would have to repair.
    const m = makeProbe({ nodeVersion: '20.11.0', files: { [join(TOOL, 'node_modules/.package-lock.json')]: undefined as never } });
    const plan = preflightPlan(m.probe);
    expect(plan.ok).toBe(false);
    expect(codes(plan)).toEqual(['E_NODE']);
    expect(plan.errors[0].message).toContain('20.11.0');
    expect(plan.errors[0].fix).toContain('22.12');
    expect(m.writes).toEqual([]);
    expect(m.runs).toEqual([]);
  });

  it('accepts exactly the floor (22.12) and newer majors, refuses 22.11', () => {
    expect(preflightPlan(makeProbe({ nodeVersion: '22.12.0' }).probe).ok).toBe(true);
    expect(preflightPlan(makeProbe({ nodeVersion: '24.0.0' }).probe).ok).toBe(true);
    expect(codes(preflightPlan(makeProbe({ nodeVersion: '22.11.9' }).probe))).toEqual(['E_NODE']);
  });

  it('--expect mismatch → E_VERSION with the exact scaffolder re-run command (B4 upgrade skew)', () => {
    const plan = preflightPlan(makeProbe({ expectVersion: '1.1.0' }).probe);
    expect(codes(plan)).toEqual(['E_VERSION']);
    expect(plan.errors[0].message).toContain('1.1.0');
    expect(plan.errors[0].message).toContain('1.0.0');
    expect(plan.errors[0].fix).toBe(
      'Re-run the scaffolder to upgrade the toolkit: npx @ennamjsc/agents-scaffold@latest <your-roles> showreel --merge-strategy=overwrite',
    );
  });

  it('--expect equal to VERSION (or absent) passes the handshake', () => {
    expect(preflightPlan(makeProbe({ expectVersion: '1.0.0' }).probe).ok).toBe(true);
    expect(preflightPlan(makeProbe({ expectVersion: null }).probe).ok).toBe(true);
  });
});

describe('preflight plan — .gitignore files (B1) and host package.json', () => {
  it('writes both nested .gitignore files when absent, with build/, *.mp4 and .tool/', () => {
    // npm pack strips nested .gitignore files, so without this the 100 MB .tool dir and
    // every rendered MP4 would show up in the host's git status.
    const m = makeProbe();
    const plan = preflightPlan(m.probe);
    expect(plan.ok).toBe(true);
    expect(m.files.get(join(HOST, 'showreel/.gitignore'))).toBe('build/\n*.mp4\n');
    expect(m.files.get(join(HOST, '.claude/showreel/.gitignore'))).toBe('.tool/\n');
  });

  it('never overwrites an existing .gitignore (the user may have edited it)', () => {
    const m = makeProbe({
      files: { [join(HOST, 'showreel/.gitignore')]: 'mine\n', [join(HOST, '.claude/showreel/.gitignore')]: 'also mine\n' },
    });
    preflightPlan(m.probe);
    expect(m.files.get(join(HOST, 'showreel/.gitignore'))).toBe('mine\n');
    expect(m.files.get(join(HOST, '.claude/showreel/.gitignore'))).toBe('also mine\n');
    expect(m.writes.filter((p) => p.endsWith('.gitignore'))).toEqual([]);
  });

  it('never writes the host package.json, even on a fresh install', () => {
    const m = makeProbe({ files: { [join(TOOL, 'node_modules/.package-lock.json')]: undefined as never } });
    preflightPlan(m.probe);
    expect(m.writes.length).toBeGreaterThan(0);
    for (const w of m.writes) expect(path.resolve(w)).not.toBe(path.resolve(HOST, 'package.json'));
    const npm = m.runs.filter((r) => r.cmd === 'npm');
    expect(npm).toHaveLength(1);
    for (const r of npm) expect(path.resolve(r.cwd!)).toBe(path.resolve(TOOL)); // npm only ever runs inside .tool
  });
});

describe('preflight plan — deps (npm ci into .tool)', () => {
  const npmCi = (m: ReturnType<typeof makeProbe>) => m.runs.filter((r) => r.cmd === 'npm');

  it('missing .tool/node_modules/.package-lock.json → copies manifest+lock and runs npm ci in .tool', () => {
    const m = makeProbe({ files: { [join(TOOL, 'node_modules/.package-lock.json')]: undefined as never, [join(TOOL, 'package-lock.json')]: undefined as never } });
    const plan = preflightPlan(m.probe);
    expect(plan.ok).toBe(true);
    expect(m.files.get(join(TOOL, 'package.json'))).toBe('{"name":"showreel-tool"}\n');
    expect(m.files.get(join(TOOL, 'package-lock.json'))).toBe(LOCK);
    expect(npmCi(m)).toEqual([{ cmd: 'npm', args: ['ci', '--no-audit', '--no-fund'], cwd: TOOL }]);
  });

  it('lock hash differs (toolkit upgraded) → reinstalls; matching lock → no npm ci at all', () => {
    const stale = makeProbe({ files: { [join(TOOL, 'package-lock.json')]: '{"old":true}\n' } });
    preflightPlan(stale.probe);
    expect(npmCi(stale)).toHaveLength(1);
    expect(stale.files.get(join(TOOL, 'package-lock.json'))).toBe(LOCK);

    const fresh = makeProbe();
    preflightPlan(fresh.probe);
    expect(npmCi(fresh)).toEqual([]);
  });

  it('npm ci failure → E_DEPS whose fix names HTTPS_PROXY', () => {
    const m = makeProbe({
      files: { [join(TOOL, 'node_modules/.package-lock.json')]: undefined as never },
      runs: (r) => (r.cmd === 'npm' ? { status: 1, stderr: 'ETIMEDOUT registry.npmjs.org' } : { status: 0 }),
    });
    const plan = preflightPlan(m.probe);
    expect(plan.ok).toBe(false);
    expect(codes(plan)).toContain('E_DEPS');
    const e = plan.errors.find((x) => x.code === 'E_DEPS')!;
    expect(e.message).toContain('ETIMEDOUT');
    expect(e.fix).toContain('HTTPS_PROXY');
  });
});

describe('preflight plan — ffmpeg resolution (D7)', () => {
  it('FFMPEG_BIN wins over ffmpeg-static', () => {
    const m = makeProbe({ env: { FFMPEG_BIN: 'D:\\tools\\ffmpeg.exe' }, files: { 'D:\\tools\\ffmpeg.exe': 'bin' } });
    const plan = preflightPlan(m.probe);
    expect(plan.ffmpeg).toEqual({ path: 'D:\\tools\\ffmpeg.exe', source: 'FFMPEG_BIN' });
  });

  it('FFMPEG_BIN pointing at nothing → E_FFMPEG (an explicit setting never falls through silently)', () => {
    const plan = preflightPlan(makeProbe({ env: { FFMPEG_BIN: 'D:\\nope\\ffmpeg.exe' } }).probe);
    expect(codes(plan)).toEqual(['E_FFMPEG']);
    expect(plan.errors[0].message).toContain('D:\\nope\\ffmpeg.exe');
    expect(plan.errors[0].fix).toContain('FFMPEG_BIN');
  });

  it('ffmpeg-static binary missing → runs install.js once; repair succeeds → ok', () => {
    const m = makeProbe({
      files: { [FFMPEG_STATIC]: undefined as never },
      runs: (r, files) => {
        if (r.args.some((a) => a.endsWith('install.js'))) files.set(FFMPEG_STATIC, 'bin');
        return { status: 0 };
      },
    });
    const plan = preflightPlan(m.probe);
    expect(plan.ok).toBe(true);
    expect(plan.ffmpeg).toEqual({ path: FFMPEG_STATIC, source: 'ffmpeg-static' });
    expect(m.runs.filter((r) => r.args.some((a) => a.endsWith('install.js')))).toHaveLength(1);
  });

  it('ffmpeg missing + repair fails → E_FFMPEG naming FFMPEG_BIN and FFMPEG_BINARIES_URL', () => {
    const m = makeProbe({
      files: { [FFMPEG_STATIC]: undefined as never },
      runs: (r) => (r.args.some((a) => a.endsWith('install.js')) ? { status: 1, stderr: 'getaddrinfo ENOTFOUND github.com' } : { status: 0 }),
    });
    const plan = preflightPlan(m.probe);
    expect(plan.ok).toBe(false);
    expect(codes(plan)).toEqual(['E_FFMPEG']);
    expect(plan.errors[0].fix).toContain('FFMPEG_BIN');
    expect(plan.errors[0].fix).toContain('FFMPEG_BINARIES_URL');
    expect(m.runs.filter((r) => r.args.some((a) => a.endsWith('install.js')))).toHaveLength(1);
  });

  it('an ffmpeg that exists but does not run (-version fails) → E_FFMPEG, not a mid-render crash', () => {
    const m = makeProbe({ runs: (r) => (r.args[0] === '-version' ? { status: 3221225781 } : { status: 0 }) });
    expect(codes(preflightPlan(m.probe))).toEqual(['E_FFMPEG']);
  });
});

describe('preflight plan — browser detection order (D6)', () => {
  it('no browser anywhere → E_BROWSER with the exact install/env fix', () => {
    const m = makeProbe({ files: { [WIN_CHROME]: undefined as never } });
    const plan = preflightPlan(m.probe);
    expect(plan.ok).toBe(false);
    expect(codes(plan)).toEqual(['E_BROWSER']);
    expect(plan.errors[0].fix).toBe('Install Google Chrome or set SHOWREEL_BROWSER=/path/to/chrome');
    expect(plan.browser).toBeNull();
  });

  it('Edge-only Windows host → browser.kind "edge" (most Windows boxes have no Chrome)', () => {
    const m = makeProbe({ files: { [WIN_CHROME]: undefined as never, [WIN_EDGE]: 'bin' } });
    const plan = preflightPlan(m.probe);
    expect(plan.ok).toBe(true);
    expect(plan.browser).toMatchObject({ kind: 'edge', path: WIN_EDGE, source: 'edge-default' });
  });

  it('Chrome beats Edge when both are installed', () => {
    const m = makeProbe({ files: { [WIN_EDGE]: 'bin' } });
    expect(preflightPlan(m.probe).browser).toMatchObject({ kind: 'chrome', path: WIN_CHROME });
  });

  it('SHOWREEL_BROWSER wins over CHROME_PATH, installed Chrome and Edge', () => {
    const m = makeProbe({
      env: { SHOWREEL_BROWSER: 'D:\\portable\\brave.exe', CHROME_PATH: WIN_CHROME },
      files: { 'D:\\portable\\brave.exe': 'bin', [WIN_EDGE]: 'bin' },
    });
    expect(preflightPlan(m.probe).browser).toMatchObject({ kind: 'custom', path: 'D:\\portable\\brave.exe', source: 'SHOWREEL_BROWSER' });
  });

  it('CHROME_PATH wins over per-OS defaults', () => {
    const m = makeProbe({ env: { CHROME_PATH: 'D:\\c\\chrome.exe' }, files: { 'D:\\c\\chrome.exe': 'bin', [WIN_EDGE]: 'bin' } });
    expect(preflightPlan(m.probe).browser).toMatchObject({ kind: 'chrome', path: 'D:\\c\\chrome.exe', source: 'CHROME_PATH' });
  });

  it('SHOWREEL_BROWSER pointing at nothing → E_BROWSER naming the var, no silent fallback to Chrome', () => {
    const plan = preflightPlan(makeProbe({ env: { SHOWREEL_BROWSER: 'D:\\gone.exe' } }).probe);
    expect(codes(plan)).toEqual(['E_BROWSER']);
    expect(plan.errors[0].message).toContain('SHOWREEL_BROWSER');
    expect(plan.errors[0].message).toContain('D:\\gone.exe');
    // A real ShowreelError, so launchBrowser / the cli map it to E_BROWSER without re-wrapping.
    expect(() => detectBrowser(makeProbe({ env: { SHOWREEL_BROWSER: 'D:\\gone.exe' } }).probe)).toThrow(ShowreelError);
  });

  it('an unexpected probe failure (fs EACCES) is rethrown, not recorded as a browser step with code undefined', () => {
    // Rule 12: only our own E_* errors become step failures. A raw fs error must reach the
    // cli, which reports it loudly as E_INTERNAL instead of {code: undefined} or {code: 'EACCES'}.
    const m = makeProbe();
    const exists = m.probe.exists;
    m.probe.exists = (p: string) => {
      if (p === WIN_CHROME) throw Object.assign(new Error(`EACCES: permission denied, stat '${p}'`), { code: 'EACCES' });
      return exists(p);
    };
    expect(() => preflightPlan(m.probe)).toThrow(/EACCES/);
  });

  it('Linux: Chrome → Edge → chromium on PATH, in that order', () => {
    const linux = (files: Record<string, string>, which: Record<string, string> = {}) =>
      detectBrowser(makeProbe({ platform: 'linux', env: {}, files: { [WIN_CHROME]: undefined as never, ...files }, which }).probe);
    expect(linux({ '/usr/bin/google-chrome': 'b', '/usr/bin/microsoft-edge': 'b' }, { chromium: '/usr/bin/chromium' })).toMatchObject({ kind: 'chrome' });
    expect(linux({ '/usr/bin/microsoft-edge': 'b' }, { chromium: '/usr/bin/chromium' })).toMatchObject({ kind: 'edge' });
    expect(linux({}, { 'chromium-browser': '/snap/bin/chromium-browser' })).toMatchObject({ kind: 'chromium', path: '/snap/bin/chromium-browser', source: 'PATH' });
    expect(linux({}, {})).toBeNull();
  });

  it('macOS Edge-only → edge', () => {
    const p = makeProbe({ platform: 'darwin', env: {}, files: { [WIN_CHROME]: undefined as never, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge': 'b' } });
    expect(detectBrowser(p.probe)).toMatchObject({ kind: 'edge' });
  });

  it('kindOfPath / usesConnectPath: any msedge binary (even via SHOWREEL_BROWSER) takes the Edge connect path', () => {
    // M0: Edge's launcher detaches and exits 0, so puppeteer.launch loses the process and
    // leaves an orphaned headless Edge. Routing on the binary name, not the detection
    // source, keeps an env-provided Edge off the broken path too.
    expect(kindOfPath(WIN_EDGE)).toBe('edge');
    expect(kindOfPath('/opt/microsoft/msedge/msedge')).toBe('edge');
    expect(kindOfPath('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')).toBe('edge');
    expect(kindOfPath(WIN_CHROME)).toBe('chrome');
    expect(kindOfPath('/usr/bin/chromium-browser')).toBe('chromium');
    expect(kindOfPath('D:\\portable\\brave.exe')).toBe('custom');
    expect(usesConnectPath(WIN_EDGE)).toBe(true);
    expect(usesConnectPath(WIN_CHROME)).toBe(false);
  });
});

describe('preflight plan — sandbox flag (C11) and GPU probe', () => {
  const BASE = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'];

  it('root uid → --no-sandbox; non-root without env → absent; SHOWREEL_NO_SANDBOX=1 → present', () => {
    // Chrome refuses to start as root without --no-sandbox (Linux CI/containers), but
    // disabling the sandbox for everyone else would be a needless security downgrade.
    expect(launchArgs({ env: {}, uid: 0 })).toEqual(['--no-sandbox', ...BASE]);
    expect(launchArgs({ env: {}, uid: 1000 })).toEqual(BASE);
    expect(launchArgs({ env: {}, uid: null })).toEqual(BASE);
    expect(launchArgs({ env: { SHOWREEL_NO_SANDBOX: '1' }, uid: 1000 })).toEqual(['--no-sandbox', ...BASE]);
    expect(launchArgs({ env: { SHOWREEL_NO_SANDBOX: '0' }, uid: 1000 })).toEqual(BASE);
  });

  it('the plan carries the same args for the detected browser', () => {
    expect(preflightPlan(makeProbe({ platform: 'linux', uid: 0, env: {}, files: { '/usr/bin/google-chrome': 'b' } }).probe).browser.args).toEqual(['--no-sandbox', ...BASE]);
    expect(preflightPlan(makeProbe().probe).browser.args).toEqual(BASE);
  });

  it('SwiftShader renderer → the exact GPU-less notice; a real GPU → no notice', () => {
    expect(GPU_NOTICE).toBe('no GPU detected — motion blur reduced (S=1)');
    const soft = preflightPlan(makeProbe({ renderer: SWIFTSHADER }).probe);
    expect(soft.ok).toBe(true);
    expect(soft.gpuNotice).toBe(GPU_NOTICE);
    expect(soft.renderer).toBe(SWIFTSHADER);
    expect(preflightPlan(makeProbe().probe).gpuNotice).toBeNull();
  });

  it('a detected browser that cannot launch → E_BROWSER with the launch error (found ≠ usable)', () => {
    const plan = preflightPlan(makeProbe({ renderer: { error: 'Failed to launch the browser process: Code: 0' } }).probe);
    expect(codes(plan)).toEqual(['E_BROWSER']);
    expect(plan.errors[0].message).toContain('Code: 0');
    expect(plan.errors[0].message).toContain(WIN_CHROME);
  });

  it('every step is reported (nothing skipped silently)', () => {
    const plan = preflightPlan(makeProbe().probe);
    expect(plan.steps.map((s: { name: string }) => s.name)).toEqual(['node', 'version', 'gitignore', 'deps', 'ffmpeg', 'browser', 'gpu']);
    const failed = preflightPlan(makeProbe({ files: { [join(TOOL, 'node_modules/.package-lock.json')]: undefined as never }, runs: (r) => ({ status: r.cmd === 'npm' ? 1 : 0 }) }).probe);
    // ffmpeg-static and the GPU probe need the deps: they are marked skipped, not ok.
    expect(failed.steps.find((s: { name: string }) => s.name === 'gpu').status).toBe('skipped');
  });
});

describe('preflight cmd', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints one {"ok":false,"cmd":"preflight"} JSON line and returns 1 on --expect mismatch', async () => {
    const host = mkdtempSync(join(tmpdir(), 'showreel-pf-'));
    try {
      const out: string[] = [];
      vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => { out.push(String(s)); return true; });
      const code = await run(['--expect', '9.9.9'], host);
      vi.restoreAllMocks();
      expect(code).toBe(1);
      expect(out).toHaveLength(1);
      const line = JSON.parse(out[0]);
      expect(line).toMatchObject({ ok: false, cmd: 'preflight', error: { code: 'E_VERSION' } });
      // Refused before any side effect.
      expect(existsSync(join(host, 'showreel'))).toBe(false);
    } finally {
      rmSync(host, { recursive: true, force: true });
    }
  });

  it('--expect without a value → E_USAGE', async () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => { out.push(String(s)); return true; });
    const code = await run(['--expect'], tmpdir());
    vi.restoreAllMocks();
    expect(code).toBe(1);
    expect(JSON.parse(out[0]).error.code).toBe('E_USAGE');
  });
});

describe('launchWith — launch routing (C11) with a puppeteer stub', () => {
  const ARGS = ['--enable-unsafe-swiftshader'];
  const fakeBrowser = { version: async () => 'Chrome/1' };

  it('Chrome: puppeteer.launch fails → connect path is tried; both failing → one E_BROWSER naming both errors', async () => {
    // The connect fallback is what saves a Chrome whose launcher misbehaves like Edge's; if it
    // fails too the user must see both causes, not just the last one.
    const puppeteer = { launch: vi.fn().mockRejectedValue(new Error('Failed to launch the browser process!\nstack…')) };
    const connect = vi.fn().mockRejectedValue(new Error('no DevToolsActivePort in X after 15 s'));
    const err = await launchWith({ puppeteer, exe: WIN_CHROME, kind: 'chrome', args: ARGS, connect }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShowreelError);
    expect(err).toMatchObject({ code: 'E_BROWSER', fix: 'Install Google Chrome or set SHOWREEL_BROWSER=/path/to/chrome' });
    expect((err as Error).message).toContain('Failed to launch the browser process!');
    expect((err as Error).message).toContain('no DevToolsActivePort');
    expect((err as Error).message).not.toContain('stack…'); // first line only
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(puppeteer, WIN_CHROME, ARGS);
  });

  it('Chrome: launch fails, connect works → the connected browser (with its temp profile) is returned', async () => {
    const close = vi.fn();
    const puppeteer = { launch: vi.fn().mockRejectedValue(new Error('boom')) };
    const connect = vi.fn().mockResolvedValue({ browser: fakeBrowser, close, profileDir: '/tmp/showreel-browser-x' });
    const b = await launchWith({ puppeteer, exe: WIN_CHROME, kind: 'chrome', args: ARGS, connect });
    expect(b).toMatchObject({ kind: 'chrome', browser: fakeBrowser, profileDir: '/tmp/showreel-browser-x' });
    expect(b.close).toBe(close);
  });

  it('Chrome: launch works → connect is NOT used (the fallback must not become the default)', async () => {
    const puppeteer = { launch: vi.fn().mockResolvedValue({ ...fakeBrowser, close: vi.fn() }) };
    const connect = vi.fn();
    const b = await launchWith({ puppeteer, exe: WIN_CHROME, kind: 'chrome', args: ARGS, connect });
    expect(connect).not.toHaveBeenCalled();
    expect(puppeteer.launch).toHaveBeenCalledWith({ executablePath: WIN_CHROME, headless: true, args: ARGS });
    expect(b).toMatchObject({ kind: 'chrome', profileDir: null });
  });

  it('Edge: puppeteer.launch is never called (its launcher detaches and orphans the browser, M0)', async () => {
    const puppeteer = { launch: vi.fn() };
    const connect = vi.fn().mockResolvedValue({ browser: fakeBrowser, close: vi.fn(), profileDir: '/tmp/p' });
    const b = await launchWith({ puppeteer, exe: WIN_EDGE, kind: 'edge', args: ARGS, connect });
    expect(puppeteer.launch).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(b.kind).toBe('edge');
  });
});

describe('render/browser.mjs import graph', () => {
  it('does not (transitively) import cli.mjs or lib/preflight/probe.mjs', () => {
    // Every render-path consumer imports browser.mjs. Pulling in cli.mjs from there would make
    // the render path evaluate the CLI entry point and create an import cycle through probe.mjs.
    const root = join(REPO_ROOT, 'templates/showreel/.claude/showreel');
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^\s*(?:import|export)[^'"]*from\s+['"](\.[^'"]+)['"]/gm)) walk(path.resolve(path.dirname(file), m[1]));
    };
    walk(join(root, 'render/browser.mjs'));
    const rel = [...seen].map((f) => path.relative(root, f).replace(/\\/g, '/'));
    expect(rel).toContain('lib/preflight/plan.mjs'); // the walker really follows imports
    expect(rel).not.toContain('cli.mjs');
    expect(rel).not.toContain('lib/preflight/probe.mjs');
  });

  it('lib/preflight/probe.mjs does not (transitively) import cli.mjs (no cli -> cmd -> probe -> cli cycle)', () => {
    const root = join(REPO_ROOT, 'templates/showreel/.claude/showreel');
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^\s*(?:import|export)[^'"]*from\s+['"](\.[^'"]+)['"]/gm)) walk(path.resolve(path.dirname(file), m[1]));
    };
    walk(join(root, 'lib/preflight/probe.mjs'));
    const rel = [...seen].map((f) => path.relative(root, f).replace(/\\/g, '/'));
    expect(rel).toContain('lib/util/version.mjs'); // VERSION comes from the dependency-free module
    expect(rel).not.toContain('cli.mjs');
  });
});

describe('runGpuProbe — child process hygiene (fake browser module)', () => {
  const FAKE = pathToFileURL(join(HERE, 'fixtures/preflight/fake-browser.mjs')).href;
  let work: string;
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const withEnv = (mode: string) => {
    work = mkdtempSync(join(tmpdir(), 'showreel-pf-gpu-'));
    process.env.SHOWREEL_FAKE_MODE = mode;
    process.env.SHOWREEL_FAKE_PID_FILE = join(work, 'pid');
  };
  afterEach(() => {
    delete process.env.SHOWREEL_FAKE_MODE;
    delete process.env.SHOWREEL_FAKE_PID_FILE;
    if (work) rmSync(work, { recursive: true, force: true });
  });

  it('close() failure → error, even though the renderer was already read (leak guard is not swallowed)', () => {
    withEnv('close-fails');
    const r = runGpuProbe({ hostRoot: tmpdir(), exe: 'fake', browserModuleUrl: FAKE });
    expect(r.renderer).toBeUndefined();
    expect(r.error).toMatch(/^close failed: Browser processes still hold/);
  }, 30_000);

  it('timeout after the browser spawned → the orphaned browser is killed and the error says so', () => {
    // M0 leak class: killing only the node child would leave headless Edge running on the user's box.
    withEnv('hang');
    const r = runGpuProbe({ hostRoot: tmpdir(), exe: 'fake', browserModuleUrl: FAKE, timeoutMs: 5_000 });
    expect(r.error).toMatch(/timed out after 5 s/);
    expect(r.error).toMatch(/leftover browser processes were killed/);
    const pid = Number(readFileSync(join(work, 'pid'), 'utf8'));
    expect(pid).toBeGreaterThan(0);
    expect(alive(pid)).toBe(false);
  }, 60_000);

  it('a browser leaked by a "successful" probe is still killed by the parent', () => {
    withEnv('leak');
    const r = runGpuProbe({ hostRoot: tmpdir(), exe: 'fake', browserModuleUrl: FAKE });
    expect(r).toEqual({ renderer: 'FAKE RENDERER' });
    expect(alive(Number(readFileSync(join(work, 'pid'), 'utf8')))).toBe(false);
  }, 30_000);
});

// ---------------------------------------------------------------------------------------
// Real browsers on this machine. Gated: needs Chrome/Edge + the dev tool dir.
const E2E = process.env.SHOWREEL_E2E === '1';
const EDGE_PATH = process.platform === 'win32'
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  : process.platform === 'darwin' ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' : '/usr/bin/microsoft-edge';
const CHROME_PATH = process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome';
if (E2E && !process.env.SHOWREEL_TOOL_DIR) process.env.SHOWREEL_TOOL_DIR = join(REPO_ROOT, '.showreel-dev/.tool');

describe.skipIf(!E2E)('preflight E2E (SHOWREEL_E2E=1)', () => {
  it.skipIf(!existsSync(EDGE_PATH))('launchBrowser(Edge) → Edg version, and close() leaves zero processes on the temp profile', async () => {
    const b = await launchBrowser({ hostRoot: REPO_ROOT, executablePath: EDGE_PATH });
    expect(b.kind).toBe('edge');
    expect(b.profileDir).toBeTruthy();
    const version = await b.browser.version();
    expect(version).toMatch(/^(Headless)?Edg\//);
    expect(listProfileProcesses(b.profileDir).length).toBeGreaterThan(0); // the probe really sees Edge
    await b.close();
    expect(listProfileProcesses(b.profileDir)).toEqual([]);
    expect(existsSync(b.profileDir)).toBe(false);
  }, 60_000);

  it.skipIf(!existsSync(CHROME_PATH))('launchBrowser(Chrome) → Chrome version', async () => {
    const b = await launchBrowser({ hostRoot: REPO_ROOT, executablePath: CHROME_PATH });
    expect(b.kind).toBe('chrome');
    expect(await b.browser.version()).toMatch(/Chrome\//);
    await b.close();
  }, 60_000);

  it('realProbe: detection finds a browser and the GPU probe returns a renderer string', () => {
    const probe = realProbe(REPO_ROOT, {});
    const found = detectBrowser(probe);
    expect(found).not.toBeNull();
    const r = probe.gpuRenderer({ ...found, args: launchArgs() });
    expect(r.error).toBeUndefined();
    expect(typeof r.renderer).toBe('string');
    expect(r.renderer.length).toBeGreaterThan(0);
  }, 90_000);

  it.skipIf(!existsSync(EDGE_PATH))('realProbe gpuRenderer with Edge → renderer string (preflight works on an Edge-only host)', () => {
    const probe = realProbe(REPO_ROOT, {});
    const r = probe.gpuRenderer({ kind: 'edge', path: EDGE_PATH, source: 'test', args: launchArgs() });
    expect(r.error).toBeUndefined();
    expect(r.renderer.length).toBeGreaterThan(0);
  }, 90_000);
});
