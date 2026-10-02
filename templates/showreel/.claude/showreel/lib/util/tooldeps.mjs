// Heavy deps (puppeteer-core, ffmpeg-static, fonts) live in the tool dir, installed by
// `cli.mjs preflight` with `npm ci` — never in the host's own node_modules (C1/C2).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ShowreelError } from './out.mjs';

export function toolDir(hostRoot) {
  return process.env.SHOWREEL_TOOL_DIR ?? join(hostRoot, '.claude/showreel/.tool');
}

/** import() a dependency installed in the tool dir. Missing → ShowreelError('E_DEPS'). */
export async function loadDep(name, hostRoot) {
  const dir = toolDir(hostRoot);
  let resolved;
  try {
    resolved = createRequire(join(dir, 'node_modules/')).resolve(name);
  } catch {
    throw new ShowreelError(
      'E_DEPS',
      `Dependency "${name}" is not installed in ${dir}.`,
      'run: node .claude/showreel/cli.mjs preflight',
    );
  }
  return import(pathToFileURL(resolved).href);
}
