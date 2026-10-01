// showreel toolkit CLI — `node .claude/showreel/cli.mjs <command> [--root <dir>] [args…]`.
// Prints exactly one compact JSON line: {"ok":true,"cmd":…} or {"ok":false,"cmd":…,"error":{code,message,fix}}.
//
// This file must PARSE on Node 18+ so an old Node gets an actionable message instead of a
// SyntaxError: ES2018 syntax only at the top level, and the Node floor check runs before
// any dynamic import of the toolkit modules.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ok, fail, ShowreelError } from './lib/util/out.mjs';

export const VERSION = '1.0.0';

const NODE_FLOOR = [22, 12];

// Command → loader of a module exporting `run(args, hostRoot) → Promise<exitCode>`.
// null = not implemented yet (M1 tasks wire these: facts = Task 2, preflight = Task 7,
// check/render/verify = Task 8).
const COMMANDS = {
  preflight: null,
  facts: null,
  check: null,
  render: null,
  verify: null,
};

function nodeTooOld(version) {
  const parts = String(version).split('.').map(Number);
  if (parts[0] !== NODE_FLOOR[0]) return parts[0] < NODE_FLOOR[0];
  return parts[1] < NODE_FLOOR[1];
}

function parseArgs(argv) {
  const rest = [];
  let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') {
      if (i + 1 >= argv.length) throw new ShowreelError('E_USAGE', '--root needs a directory.', 'Use: --root <dir>');
      root = argv[++i];
    } else if (a.indexOf('--root=') === 0) {
      root = a.slice('--root='.length);
    } else {
      rest.push(a);
    }
  }
  return { root: resolve(root), rest: rest };
}

export async function main(argv) {
  const cmd = argv[0] || '';
  if (nodeTooOld(process.versions.node)) {
    return fail(
      'preflight',
      'E_NODE',
      'Node ' + process.versions.node + ' is too old for the showreel toolkit (needs >= 22.12).',
      'Install Node 22.12+ (e.g. nvm install 22) and re-run: node .claude/showreel/cli.mjs preflight',
    );
  }
  const usage = 'Use: node .claude/showreel/cli.mjs <' + Object.keys(COMMANDS).concat('version').join('|') + '> [--root <dir>]';
  if (cmd === 'version') return ok('version', { version: VERSION });
  if (!Object.prototype.hasOwnProperty.call(COMMANDS, cmd)) {
    return fail(cmd || 'cli', 'E_USAGE', cmd ? 'Unknown command "' + cmd + '".' : 'No command given.', usage);
  }
  const loader = COMMANDS[cmd];
  if (loader === null) {
    return fail(cmd, 'E_NOT_IMPLEMENTED', 'Command "' + cmd + '" is not implemented in toolkit ' + VERSION + '.', 'Upgrade the toolkit: npx @ennamjsc/agents-scaffold@latest <your-roles> showreel');
  }
  try {
    const args = parseArgs(argv.slice(1));
    const mod = await loader();
    return await mod.run(args.rest, args.root);
  } catch (err) {
    if (err instanceof ShowreelError) return fail(cmd, err.code, err.message, err.fix);
    return fail(cmd, 'E_INTERNAL', String((err && err.stack) || err), 'This is a toolkit bug — report it with the command you ran.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => { process.exitCode = fail('cli', 'E_INTERNAL', String((err && err.stack) || err), 'This is a toolkit bug — report it with the command you ran.'); },
  );
}
