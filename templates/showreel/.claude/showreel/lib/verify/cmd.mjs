// `cli.mjs verify` (Task 8): D13 counts + AC4 analyze + D8 manifest + D9 spot check on the last render.
// Prints ok('verify', {videoFrames, audioSamples, expected, peakDbfs, hitsOk, manifestOk, determinismOk, …})
// or fail('verify', 'E_VERIFY', <every failed check>).
import { performance } from 'node:perf_hooks';
import { ok, fail, ShowreelError } from '../util/out.mjs';
import { runVerify } from './run.mjs';

const CMD = 'verify';

export async function run(args, hostRoot) {
  if (args.length) throw new ShowreelError('E_USAGE', `Unknown argument "${args[0]}" for verify.`, 'Use: node .claude/showreel/cli.mjs verify');
  const start = performance.now();
  const { data, failed } = await runVerify(hostRoot);
  if (failed.length) {
    return fail(CMD, 'E_VERIFY', `${failed.length} check(s) failed for ${data.out}: ${failed.join(' | ')}`, `Re-render: node .claude/showreel/cli.mjs render --${data.mode}; if it fails again, report a toolkit bug with this output.`);
  }
  return ok(CMD, { ...data, ms: Math.round(performance.now() - start) });
}
