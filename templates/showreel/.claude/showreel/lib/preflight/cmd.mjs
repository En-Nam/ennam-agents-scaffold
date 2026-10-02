// `cli.mjs preflight [--expect <version>]` (Task 7). Exports run(args, hostRoot) → exit code,
// the command-module shape cli.mjs dispatches to.
import { ok, fail } from '../util/out.mjs';
import { preflightPlan } from './plan.mjs';
import { realProbe } from './probe.mjs';

const CMD = 'preflight';

export async function run(args, hostRoot) {
  let expect = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--expect') {
      if (i + 1 >= args.length) return fail(CMD, 'E_USAGE', '--expect needs a version.', 'Use: preflight --expect <version>');
      expect = args[++i];
    } else if (a.startsWith('--expect=')) {
      expect = a.slice('--expect='.length);
    } else {
      return fail(CMD, 'E_USAGE', `Unknown argument "${a}".`, 'Use: node .claude/showreel/cli.mjs preflight [--expect <version>]');
    }
  }
  const plan = preflightPlan(realProbe(hostRoot, { expect }));
  if (!plan.ok) {
    // One error object per output line (C2); any further errors are appended, never dropped.
    const [first, ...rest] = plan.errors;
    const more = rest.map((e) => ` Also ${e.code}: ${e.message} Fix: ${e.fix}`).join('');
    return fail(CMD, first.code, first.message + more, first.fix);
  }
  return ok(CMD, {
    steps: plan.steps,
    browser: plan.browser,
    ffmpeg: plan.ffmpeg,
    renderer: plan.renderer,
    gpuNotice: plan.gpuNotice,
  });
}
