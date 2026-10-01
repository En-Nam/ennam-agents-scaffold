import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// v1.14 — agent-org ships saved Claude Code workflows (.claude/workflows/*.js).
// They run only in the USER's session, so every runtime rule Claude Code enforces
// must be caught here instead:
//   - a non-literal `meta` silently drops the command from `/` autocomplete;
//   - Date.now()/Math.random()/argless new Date() throw at runtime (resume determinism);
//   - import() fails before the run starts;
//   - a phase() title missing from meta.phases gets an orphan progress group.
// The behaviour tests run each script against stubbed agent()/parallel()/pipeline()
// so the control flow users rely on (stall detection, index/letter mapping) can fail here.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, '..', '..', 'templates', 'agent-org', '.claude', 'workflows');
const EXPECTED = ['fix-loop.js', 'judge-panel.js', 'review-changes.js'];

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...a: string[]) => (...v: unknown[]) => Promise<unknown>;
const HOOKS = ['agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', 'workflow'];

function extractMeta(src: string): string {
  const start = src.indexOf('{');
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unterminated meta');
}

const read = (f: string) => readFile(path.join(DIR, f), 'utf8');

describe('agent-org workflow scripts — shape', () => {
  it('ships exactly the 3 documented workflows', async () => {
    expect((await readdir(DIR)).sort()).toEqual(EXPECTED);
  });

  describe.each(EXPECTED)('%s', (file) => {
    it('begins with `export const meta = {` as the first statement', async () => {
      expect(await read(file)).toMatch(/^export const meta = \{/);
    });

    it('meta is a pure literal with name === filename and a description', async () => {
      const metaSrc = extractMeta(await read(file));
      expect(metaSrc).not.toMatch(/\$\{|\.\.\.|`/);
      // Evaluating with no scope: any identifier reference throws ReferenceError.
      const meta = new Function(`"use strict"; return (${metaSrc});`)() as { name: string; description: string; phases?: { title: string }[] };
      expect(meta.name).toBe(file.replace(/\.js$/, ''));
      expect(meta.description.length).toBeGreaterThan(10);
    });

    it('every phase used in the body is declared in meta.phases', async () => {
      const src = await read(file);
      const meta = new Function(`return (${extractMeta(src)});`)() as { phases: { title: string }[] };
      const declared = new Set(meta.phases.map(p => p.title));
      const used = [...src.matchAll(/phase(?:\(|: )'([^']+)'/g)].map(m => m[1]);
      expect(used.length).toBeGreaterThan(0);
      for (const t of used) expect(declared.has(t)).toBe(true);
    });

    it('uses no runtime-forbidden APIs', async () => {
      const src = await read(file);
      expect(src).not.toMatch(/Date\.now\(|Math\.random\(|new Date\(\)|\bimport\(/);
    });

    it('body compiles as an async script', async () => {
      const body = (await read(file)).replace(/^export /, '');
      expect(() => new AsyncFunction(...HOOKS, body)).not.toThrow();
    });
  });
});

// ── behaviour harness ────────────────────────────────────────────────────────

type AgentFn = (prompt: string, opts: { label?: string; agentType?: string }) => Promise<unknown>;

async function run(file: string, args: unknown, agent: AgentFn) {
  const body = (await read(file)).replace(/^export /, '');
  const parallel = (thunks: (() => Promise<unknown>)[]) =>
    Promise.all(thunks.map(t => t().catch(() => null)));
  const pipeline = (items: unknown[], ...stages: ((prev: unknown, item: unknown, i: number) => unknown)[]) =>
    Promise.all(items.map(async (item, i) => {
      let r: unknown = item;
      try {
        for (const s of stages) r = await s(r, item, i);
        return r;
      } catch {
        return null;
      }
    }));
  const logs: string[] = [];
  const fn = new AsyncFunction(...HOOKS, body);
  const result = await fn(agent, parallel, pipeline, () => {}, (m: string) => logs.push(m), args, { total: null }, null);
  return { result: result as Record<string, unknown>, logs };
}

describe('fix-loop — behaviour', () => {
  it('refuses to run without a check command (no guessed default)', async () => {
    await expect(run('fix-loop.js', undefined, async () => null)).rejects.toThrow(/Usage: \/fix-loop/);
  });

  it('stops green as soon as the check passes, using the implementer role', async () => {
    const types: (string | undefined)[] = [];
    const checks = [{ passed: false, failureCount: 2, failures: ['a', 'b'] }, { passed: true, failureCount: 0, failures: [] }];
    const { result } = await run('fix-loop.js', 'npm test', async (_p, o) => {
      types.push(o.agentType);
      return o.label?.startsWith('check') ? checks.shift() : 'fixed';
    });
    expect(result.status).toBe('green');
    expect(types).toEqual(['implementer', 'implementer', 'implementer']);
  });

  it('stops after 2 consecutive rounds that do not reduce the failure count', async () => {
    let calls = 0;
    const { result } = await run('fix-loop.js', 'npm test', async (_p, o) => {
      calls++;
      return o.label?.startsWith('check') ? { passed: false, failureCount: 3, failures: ['x'] } : 'tried';
    });
    expect(result.status).toBe('stalled');
    expect(calls).toBe(5); // check, fix, check (stall 1), fix, check (stall 2) → stop
  });

  it('keeps going while failures decrease, and caps at 5 checks', async () => {
    let count = 9;
    const { result } = await run('fix-loop.js', { check: 'npm test' }, async (_p, o) =>
      o.label?.startsWith('check') ? { passed: false, failureCount: count--, failures: ['x'] } : 'fixed');
    expect(result.status).toBe('max-rounds');
    expect((result.rounds as unknown[]).length).toBe(5);
  });
});

describe('judge-panel — behaviour', () => {
  const proposal = (approach: string) => ({ approach, rationale: 'r', tradeoffs: 't', steps: ['s'] });

  it('refuses to run without a question', async () => {
    await expect(run('judge-panel.js', '  ', async () => null)).rejects.toThrow(/Usage: \/judge-panel/);
  });

  it('resolves the winner by option letter against its own list (Rule 13)', async () => {
    const { result } = await run('judge-panel.js', 'Which cache?', async (_p, o) => {
      if (o.label === 'advocate:simplicity') return proposal('in-memory map');
      if (o.label === 'advocate:risk') return proposal('redis with TTL');
      if (o.label === 'advocate:fit') return proposal('reuse existing LRU');
      // Judge echoes a mangled approach string — must be ignored in favour of the letter.
      return { winner: 'B', tie: false, verdict: 'Redis (with TTL!)', scores: [] };
    });
    expect(result.tie).toBe(false);
    expect((result.winner as { approach: string; advocate: string }).approach).toBe('redis with TTL');
    expect((result.winner as { advocate: string }).advocate).toBe('risk');
  });

  it('declares a tie (so handoff hard-stops) when fewer than 2 advocates return', async () => {
    let judged = false;
    const { result } = await run('judge-panel.js', 'Which cache?', async (_p, o) => {
      if (o.label === 'judge') judged = true;
      return o.label === 'advocate:fit' ? proposal('reuse existing LRU') : null;
    });
    expect(result.tie).toBe(true);
    expect(judged).toBe(false);
  });
});

describe('review-changes — behaviour', () => {
  it('drops findings the skeptic refutes, by index, and runs every agent as reviewer', async () => {
    const types = new Set<string | undefined>();
    const { result, logs } = await run('review-changes.js', 'develop', async (prompt, o) => {
      types.add(o.agentType);
      if (o.label === 'review:correctness') {
        return { findings: [
          { severity: 'minor', file: 'a.ts', title: 'false alarm', detail: 'd' },
          { severity: 'blocker', file: 'b.ts', title: 'real bug', detail: 'd' },
        ] };
      }
      if (o.label?.startsWith('review:')) return { findings: [] };
      expect(prompt).toContain('git diff develop...HEAD');
      return { verdicts: [{ index: 0, refuted: true, reason: 'handled upstream' }, { index: 1, refuted: false, reason: 'confirmed' }] };
    });
    const findings = result.findings as { title: string; verified: boolean }[];
    expect(findings.map(f => f.title)).toEqual(['real bug']);
    expect(findings[0]!.verified).toBe(true);
    expect([...types]).toEqual(['reviewer']);
    expect(logs.some(l => l.includes('1/2'))).toBe(true);
  });

  it('reports an uncovered lens instead of silently omitting it', async () => {
    const { result, logs } = await run('review-changes.js', undefined, async (_p, o) =>
      o.label === 'review:tests' ? null : { findings: [] });
    expect(result.base).toBe('main');
    expect(result.uncoveredLenses).toEqual(['tests']);
    expect(logs.some(l => l.includes('NOT covered'))).toBe(true);
  });
});

// ── v1.14 review follow-ups: every Rule-12 path in the scripts must be able to fail a test ──

describe('fix-loop — edge paths', () => {
  it('only CONSECUTIVE non-improving rounds count as a stall (3,3,2,2,2 runs all 5 checks)', async () => {
    const counts = [3, 3, 2, 2, 2];
    const { result } = await run('fix-loop.js', 'npm test', async (_p, o) =>
      o.label?.startsWith('check') ? { passed: false, failureCount: counts.shift(), failures: ['x'] } : 'tried');
    expect(result.status).toBe('stalled');
    expect((result.rounds as unknown[]).length).toBe(5);
  });

  it('a failed fix agent stops the loop with status error — no further checks', async () => {
    const labels: string[] = [];
    const { result } = await run('fix-loop.js', 'npm test', async (_p, o) => {
      labels.push(o.label!);
      return o.label === 'fix:1' ? null : { passed: false, failureCount: 4, failures: ['x'] };
    });
    expect(result.status).toBe('error');
    expect(labels).toEqual(['check:1', 'fix:1']);
  });

  it('a failed check agent stops the loop with status error', async () => {
    const { result } = await run('fix-loop.js', 'npm test', async () => null);
    expect(result.status).toBe('error');
  });
});

describe('judge-panel — tie paths (each must make handoff hard-stop)', () => {
  const proposal = { approach: 'p', rationale: 'r', tradeoffs: 't', steps: ['s'] };
  const judgeWith = (judge: unknown, advocates = ['simplicity', 'risk', 'fit']) =>
    async (_p: string, o: { label?: string }) =>
      o.label === 'judge' ? judge : advocates.some(a => o.label === `advocate:${a}`) ? proposal : null;

  it('judge declares a tie', async () => {
    const { result } = await run('judge-panel.js', 'q', judgeWith({ winner: 'none', tie: true, verdict: 'close', scores: [] }));
    expect(result).toMatchObject({ tie: true, winner: null });
  });

  it('judge agent fails', async () => {
    const { result } = await run('judge-panel.js', 'q', judgeWith(null));
    expect(result).toMatchObject({ tie: true, winner: null });
  });

  it('judge names a letter that is not on the list (C with only 2 options)', async () => {
    const { result } = await run('judge-panel.js', 'q',
      judgeWith({ winner: 'C', tie: false, verdict: 'v', scores: [] }, ['simplicity', 'risk']));
    expect(result).toMatchObject({ tie: true, winner: null });
  });
});

describe('review-changes — unverified + ordering', () => {
  const f = (severity: string, title: string) => ({ severity, file: 'a.ts', title, detail: 'd' });

  it('skeptic failure keeps findings, labelled verified:false (never silently dropped)', async () => {
    const { result } = await run('review-changes.js', undefined, async (_p, o) =>
      o.label === 'review:correctness' ? { findings: [f('major', 'x')] }
        : o.label?.startsWith('review:') ? { findings: [] } : null);
    expect(result.findings).toMatchObject([{ title: 'x', verified: false }]);
  });

  it('a finding the skeptic did not rule on stays, labelled verified:false', async () => {
    const { result } = await run('review-changes.js', undefined, async (_p, o) =>
      o.label === 'review:correctness' ? { findings: [f('major', 'ruled'), f('minor', 'skipped')] }
        : o.label?.startsWith('review:') ? { findings: [] }
        : { verdicts: [{ index: 0, refuted: false, reason: 'ok' }] });
    expect(result.findings).toMatchObject([
      { title: 'ruled', verified: true },
      { title: 'skipped', verified: false },
    ]);
  });

  it('merges lenses and orders blocker → major → minor → nit', async () => {
    const byLens: Record<string, unknown[]> = {
      'review:correctness': [f('minor', 'c-minor')],
      'review:conventions': [f('nit', 'v-nit'), f('blocker', 'v-blocker')],
      'review:tests': [f('major', 't-major')],
    };
    const { result } = await run('review-changes.js', undefined, async (prompt, o) => {
      if (o.label?.startsWith('review:')) return { findings: byLens[o.label] };
      const n = (prompt.match(/"index":/g) || []).length;
      return { verdicts: Array.from({ length: n }, (_, index) => ({ index, refuted: false, reason: 'ok' })) };
    });
    expect((result.findings as { title: string }[]).map(x => x.title))
      .toEqual(['v-blocker', 't-major', 'c-minor', 'v-nit']);
  });
});
