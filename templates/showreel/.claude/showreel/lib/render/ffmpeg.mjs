// ffmpeg resolution + process helpers for check --sheet / render / verify (Task 8).
// Resolution order matches preflight (D7): FFMPEG_BIN → ffmpeg-static in the tool dir.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ShowreelError } from '../util/out.mjs';
import { toolDir } from '../util/tooldeps.mjs';

const PREFLIGHT = 'run: node .claude/showreel/cli.mjs preflight';

export function resolveFfmpeg(hostRoot) {
  const env = process.env.FFMPEG_BIN;
  if (env) {
    if (!existsSync(env)) throw new ShowreelError('E_FFMPEG', `FFMPEG_BIN is set to ${env}, but no file exists there.`, `Fix FFMPEG_BIN or unset it, then ${PREFLIGHT}`);
    return env;
  }
  let p;
  try {
    p = createRequire(join(toolDir(hostRoot), 'node_modules/'))('ffmpeg-static');
  } catch {
    throw new ShowreelError('E_DEPS', `ffmpeg-static is not installed in ${toolDir(hostRoot)}.`, PREFLIGHT);
  }
  if (!p || !existsSync(p)) throw new ShowreelError('E_FFMPEG', `ffmpeg-static binary is missing${p ? ` at ${p}` : ''}.`, PREFLIGHT);
  return p;
}

const tail = (s, n = 6) => String(s).trim().split(/\r?\n/).slice(-n).join(' | ');

/**
 * Run ffmpeg to completion. → {stderr}. Non-zero exit → ShowreelError('E_FFMPEG') with the stderr tail.
 * `onStdout(chunk)` consumes stdout (else ignored); the full stderr is returned (verify parses it).
 */
export function runFfmpeg(bin, args, { what, onStdout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', onStdout ? 'pipe' : 'ignore', 'pipe'] });
    const err = [];
    child.stderr.on('data', (d) => err.push(d));
    if (onStdout) child.stdout.on('data', onStdout);
    child.on('error', (e) => reject(new ShowreelError('E_FFMPEG', `cannot start ffmpeg (${what}): ${e.message}`, PREFLIGHT)));
    child.on('close', (code) => {
      const stderr = Buffer.concat(err).toString('utf8');
      if (code === 0) resolve({ stderr });
      else reject(new ShowreelError('E_FFMPEG', `ffmpeg ${what} exited ${code}: ${tail(stderr)}`, `Check disk space and ${PREFLIGHT}`));
    });
  });
}

/**
 * Long-lived ffmpeg fed on stdin (image2pipe). write(buf) honours backpressure and fails fast if
 * ffmpeg died; end() closes stdin and waits for a clean exit.
 */
export function startPipe(bin, args, { what }) {
  const child = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-8000); });
  let broken = null;
  child.stdin.on('error', (e) => { broken = e; });
  const done = new Promise((resolve, reject) => {
    child.on('error', (e) => reject(new ShowreelError('E_FFMPEG', `cannot start ffmpeg (${what}): ${e.message}`, PREFLIGHT)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new ShowreelError('E_FFMPEG', `ffmpeg ${what} exited ${code}: ${tail(stderr)}`, `Check disk space and ${PREFLIGHT}`));
    });
  });
  done.catch(() => {}); // observed via write()/end(); never an unhandled rejection
  return {
    async write(buf) {
      if (broken) await done.then(() => { throw broken; });
      if (!child.stdin.write(buf)) {
        await Promise.race([new Promise((r) => child.stdin.once('drain', r)), done.then(() => { throw new ShowreelError('E_FFMPEG', `ffmpeg ${what} exited before all frames were written`, PREFLIGHT); })]);
      }
    },
    async end() {
      child.stdin.end();
      await done;
    },
    abort() {
      try { child.kill('SIGKILL'); } catch { /* gone */ }
    },
  };
}
