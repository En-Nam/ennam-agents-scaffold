// `cli.mjs check [--sheet]` (Task 8): validate → resolve → compile (60 fps) → in-browser text fit +
// glyph coverage → (--sheet) draft contact sheet. Prints ok('check', {beats, hits, sheet?, ms}).
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ok, ShowreelError } from '../util/out.mjs';
import { paths } from '../util/paths.mjs';
import { prepare, fitInPage } from './prepare.mjs';
import { openSession, useSession } from '../render/session.mjs';
import { resolveFfmpeg } from '../render/ffmpeg.mjs';
import { renderSheet } from '../../render/sheet.mjs';

const CMD = 'check';
const USAGE = 'Use: node .claude/showreel/cli.mjs check [--sheet]';

export async function run(args, hostRoot) {
  const start = performance.now();
  let sheet = false;
  for (const a of args) {
    if (a === '--sheet') sheet = true;
    else throw new ShowreelError('E_USAGE', `Unknown argument "${a}" for check.`, USAGE);
  }
  const p = paths(hostRoot);
  const { resolved, timeline } = prepare(hostRoot, { fps: 60 });
  const ffmpeg = sheet ? resolveFfmpeg(hostRoot) : null; // fail before launching a browser
  await useSession(await openSession(hostRoot), async (session) => {
    const { page, errors } = await session.page();
    await fitInPage(hostRoot, page, resolved);
    if (sheet) await renderSheet({ page, ffmpeg, timeline, out: join(hostRoot, p.sheet) });
    if (errors.length) throw new ShowreelError('E_ENGINE', `Engine page errors: ${errors.join(' | ')}`, 'This is a toolkit bug — report it with the storyboard.');
  });
  return ok(CMD, {
    beats: timeline.beats.length,
    hits: timeline.hits.length,
    ...(sheet ? { sheet: p.sheet } : {}),
    ms: Math.round(performance.now() - start),
  });
}
