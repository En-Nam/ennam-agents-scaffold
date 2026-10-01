import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// v1.15 — the guided (single-role) wizard offers the `automation` add-on after the
// role is chosen. Default is No: automation guidance is opt-in, never imposed.

const answers: unknown[] = [];
let confirmAnswer: unknown = false;
const confirmCalls: Array<{ initialValue?: boolean }> = [];
const multiselectOptions: string[] = [];

vi.mock('@clack/prompts', () => ({
  select: vi.fn(async () => answers.shift()),
  multiselect: vi.fn(async (opts: { options: Array<{ value: string }> }) => { multiselectOptions.push(...opts.options.map(o => o.value)); return answers.shift(); }),
  confirm: vi.fn(async (opts: { initialValue?: boolean }) => { confirmCalls.push(opts); return confirmAnswer; }),
  isCancel: () => false,
  cancel: vi.fn(),
  log: { info: vi.fn() },
}));

const { runWizard } = await import('../../packages/cli/src/wizard.js');

describe('wizard — automation add-on', () => {
  const ttyBefore = process.stdin.isTTY;
  beforeEach(() => {
    answers.length = 0;
    confirmCalls.length = 0;
    multiselectOptions.length = 0;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: ttyBefore, configurable: true });
  });

  it('adds automation to the guided role when the user says yes', async () => {
    answers.push('single', 'Developer', 'Existing repository', 'Next.js');
    confirmAnswer = true;
    expect(await runWizard('/tmp/x')).toEqual(['next', 'automation']);
  });

  it('keeps the role alone when the user declines — and No is the default', async () => {
    answers.push('single', 'HR');
    confirmAnswer = false;
    expect(await runWizard('/tmp/x')).toEqual(['hr']);
    expect(confirmCalls[0]?.initialValue).toBe(false);
  });

  it('compose mode does not ask again (automation is already in the multiselect)', async () => {
    answers.push('compose', ['pm', 'automation']);
    expect(await runWizard('/tmp/x')).toEqual(['pm', 'automation']);
    expect(multiselectOptions).toContain('automation');
    expect(confirmCalls).toHaveLength(0);
  });
});
