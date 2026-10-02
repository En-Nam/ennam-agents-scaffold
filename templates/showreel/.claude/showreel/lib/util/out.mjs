// Compact machine-readable CLI output (C2). One JSON line on stdout per command.
// Must parse on Node 18+ (cli.mjs imports this before the Node floor check).

export class ShowreelError extends Error {
  constructor(code, message, fix) {
    super(message);
    this.name = 'ShowreelError';
    this.code = code;
    this.fix = fix;
  }
}

export function ok(cmd, data) {
  process.stdout.write(JSON.stringify(Object.assign({ ok: true, cmd: cmd }, data)) + '\n');
  return 0;
}

export function fail(cmd, code, message, fix) {
  process.stdout.write(JSON.stringify({ ok: false, cmd: cmd, error: { code: code, message: message, fix: fix } }) + '\n');
  return 1;
}
